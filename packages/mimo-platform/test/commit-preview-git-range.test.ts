// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { VCS } from "../src/domain/vcs/index.js";

/**
 * Integration tests for the commit preview / hunks / selective-commit when the
 * session carries a git `baseline` — the production topology where the
 * agent-workspace is a real git checkout and the delta is `baseline..HEAD`.
 * These exercise the git-range read paths end to end through CommitService.
 */
describe("CommitService git-range preview", () => {
  let testHome: string;
  let os: any;
  const cleanups: string[] = [];

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mimo-range-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(testHome, { recursive: true });
    cleanups.push(testHome);
    os = createOS({ ...process.env });
  });
  afterEach(() => {
    for (const d of cleanups.splice(0))
      rmSync(d, { recursive: true, force: true });
  });

  const run = (cmd: string[], cwd: string) =>
    os.command.run(cmd, { cwd, timeoutMs: 30000 });

  async function newCtx() {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    return createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
      os,
    });
  }

  /**
   * Stand up the production git topology for a session and persist its baseline:
   * upstream git checkout -> bare seed -> platform checkout -> capture baseline
   * -> remote agent commits (add/modify/delete) and pushes -> platform pulls.
   */
  async function buildGitRangeSession(ctx: any) {
    const vcs = new VCS({ os });
    const project = await ctx.repos.projects.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/test/repo.git", repoType: "git", mountPath: "." }],

      name: "Range Project",
      owner: "testuser",
    });
    const session = await ctx.repos.sessions.create({
      name: "Range Session",
      projectId: project.id,
      owner: "testuser",
    });

    // Upstream git checkout at the session's upstreamPath.
    const upstream = session.upstreamPath;
    mkdirSync(upstream, { recursive: true });
    await run(["git", "init", "-q", "-b", "main"], upstream);
    await run(["git", "config", "user.email", "a@b.c"], upstream);
    await run(["git", "config", "user.name", "a"], upstream);
    os.fs.writeFile(join(upstream, "keep.txt"), "keep\n");
    os.fs.writeFile(join(upstream, "mod.txt"), "v1\n");
    os.fs.writeFile(join(upstream, "del.txt"), "bye\n");
    await run(["git", "add", "-A"], upstream);
    await run(["git", "commit", "-qm", "seed"], upstream);

    const repoPath = join(testHome, "sess.git");
    await vcs.seedSessionRepo(upstream, "git", repoPath);

    // Platform checkout into the session's agentWorkspacePath (created empty by
    // sessions.create — git clones into an existing empty dir).
    const workspace = session.agentWorkspacePath;
    rmSync(workspace, { recursive: true, force: true });
    await vcs.clonePlatformCheckout(repoPath, workspace);

    const baseline = (await vcs.revParse(workspace, "HEAD"))!;
    await ctx.repos.sessions.update(session.id, { baseline });

    // Remote agent edits and pushes.
    const agentClone = join(testHome, "agent-clone");
    await run(["git", "clone", "-q", repoPath, agentClone], testHome);
    await run(["git", "config", "user.email", "a@b.c"], agentClone);
    await run(["git", "config", "user.name", "a"], agentClone);
    os.fs.writeFile(join(agentClone, "mod.txt"), "v1\nv2\n");
    os.fs.unlink(join(agentClone, "del.txt"));
    os.fs.writeFile(join(agentClone, "new.txt"), "fresh\n");
    await run(["git", "add", "-A"], agentClone);
    await run(["git", "commit", "-qm", "agent change"], agentClone);
    await run(["git", "push", "-q", "origin", "HEAD"], agentClone);

    await vcs.gitPull(workspace);

    return { session, upstream, workspace, baseline };
  }

  /** Count calls to a vcs method on the live service without losing behavior. */
  function spy(ctx: any, method: string) {
    const vcs = ctx.services.commits.deps.vcs;
    const real = vcs[method].bind(vcs);
    const calls: any[][] = [];
    vcs[method] = (...args: any[]) => {
      calls.push(args);
      return real(...args);
    };
    return {
      calls,
      restore: () => {
        vcs[method] = real;
      },
    };
  }

  it("getPreview lists the baseline..HEAD delta without hunks", async () => {
    const ctx = await newCtx();
    const { session } = await buildGitRangeSession(ctx);

    const nameStatus = spy(ctx, "diffNameStatus");
    const preview = await ctx.services.commits.getPreview(session.id);
    nameStatus.restore();
    expect(preview.success).toBe(true);
    // The git-range path was taken (not the two-tree scan).
    expect(nameStatus.calls.length).toBeGreaterThan(0);

    const byPath = Object.fromEntries(
      preview.preview!.files.map((f: any) => [f.path, f.status]),
    );
    expect(byPath["new.txt"]).toBe("added");
    expect(byPath["mod.txt"]).toBe("modified");
    expect(byPath["del.txt"]).toBe("deleted");
    expect(byPath["keep.txt"]).toBeUndefined();
    expect(preview.preview!.summary).toEqual({
      added: 1,
      modified: 1,
      deleted: 1,
    });
    // Initial preview omits hunks.
    for (const f of preview.preview!.files) {
      expect(f.hunks).toBeUndefined();
    }
  }, 30000);

  it("getFileHunks returns the per-file hunks from the range", async () => {
    const ctx = await newCtx();
    const { session } = await buildGitRangeSession(ctx);

    const fileRange = spy(ctx, "diffFileRange");
    const result = await ctx.services.commits.getFileHunks(
      session.id,
      "mod.txt",
    );
    fileRange.restore();
    expect(result.success).toBe(true);
    expect(fileRange.calls.length).toBeGreaterThan(0);
    const added = (result.hunks ?? [])
      .flatMap((h: any) => h.lines)
      .filter((l: string) => l === "+v2");
    expect(added).toHaveLength(1);
  }, 30000);

  it("selective commit advances the baseline so the committed file drops out", async () => {
    const ctx = await newCtx();
    const { session } = await buildGitRangeSession(ctx);

    const originalBaseline = (await ctx.repos.sessions.findById(session.id))!
      .baseline;

    const before = await ctx.services.commits.getPreview(session.id);
    expect(before.preview!.files.map((f: any) => f.path).sort()).toEqual([
      "del.txt",
      "mod.txt",
      "new.txt",
    ]);

    const advance = spy(ctx, "advanceBaseline");
    const commit = await ctx.services.commits.commitAndPushSelective(
      session.id,
      "commit new.txt only",
      ["new.txt"],
    );
    advance.restore();
    expect(commit.success).toBe(true);
    expect(advance.calls.length).toBeGreaterThan(0);

    // The baseline must have advanced and been persisted.
    const reloaded = await ctx.repos.sessions.findById(session.id);
    expect(reloaded!.baseline).toBeTruthy();
    expect(reloaded!.baseline).not.toBe(originalBaseline);

    // new.txt is no longer pending; mod.txt and del.txt remain.
    const after = await ctx.services.commits.getPreview(session.id);
    expect(after.preview!.files.map((f: any) => f.path).sort()).toEqual([
      "del.txt",
      "mod.txt",
    ]);
  }, 30000);

  it("preview is stable across a simulated process restart (baseline persists)", async () => {
    const ctx = await newCtx();
    const { session } = await buildGitRangeSession(ctx);

    const first = await ctx.services.commits.getPreview(session.id);
    const firstPaths = first.preview!.files.map((f: any) => f.path).sort();

    // Simulate a restart: brand-new context/OS over the same MIMO_HOME, so all
    // in-memory caches are gone and the baseline must come from disk.
    const ctx2 = await newCtx();
    const second = await ctx2.services.commits.getPreview(session.id);
    const secondPaths = second.preview!.files.map((f: any) => f.path).sort();

    expect(secondPaths).toEqual(firstPaths);
  }, 30000);
});
