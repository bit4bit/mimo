// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { VCS } from "../src/domain/vcs/index.js";

/**
 * Behavior tests for the native git commit-range detection helpers that back
 * the commit preview, per-file hunks, and impact change-detection. They mirror
 * the production topology: a git upstream is seeded into a bare session repo,
 * the platform clones its own checkout (`agent-workspace`), the `baseline` is
 * captured at seed time, then the remote agent commits and pushes and the
 * platform fast-forwards. The delta the preview wants is `baseline..HEAD`.
 */
describe("VCS git-range detection", () => {
  const cleanups: string[] = [];
  afterEach(() => {
    for (const d of cleanups.splice(0))
      rmSync(d, { recursive: true, force: true });
  });

  function makeWorld() {
    const os = createOS({ ...process.env });
    const vcs = new VCS({ os });
    const home = join(
      tmpdir(),
      `mimo-git-range-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(home, { recursive: true });
    cleanups.push(home);
    return { os, vcs, home };
  }

  const run = (os: any, cmd: string[], cwd: string) =>
    os.command.run(cmd, { cwd, timeoutMs: 30000 });

  async function makeGitUpstream(os: any, dir: string) {
    mkdirSync(dir, { recursive: true });
    await run(os, ["git", "init", "-q", "-b", "main"], dir);
    await run(os, ["git", "config", "user.email", "a@b.c"], dir);
    await run(os, ["git", "config", "user.name", "a"], dir);
    os.fs.writeFile(join(dir, "keep.txt"), "keep\n");
    os.fs.writeFile(join(dir, "mod.txt"), "v1\n");
    os.fs.writeFile(join(dir, "del.txt"), "bye\n");
    mkdirSync(join(dir, "sub"), { recursive: true });
    os.fs.writeFile(join(dir, "sub", "nested.txt"), "n1\n");
    await run(os, ["git", "add", "-A"], dir);
    await run(os, ["git", "commit", "-qm", "seed"], dir);
  }

  /**
   * Seed -> platform checkout -> capture baseline -> agent edits/pushes ->
   * platform fast-forwards. Returns the workspace path and the baseline SHA.
   */
  async function buildSession(os: any, vcs: VCS, home: string) {
    const upstream = join(home, "upstream");
    await makeGitUpstream(os, upstream);

    const repoPath = join(home, "sess.git");
    await vcs.seedSessionRepo(upstream, "git", repoPath);

    const workspace = join(home, "agent-workspace");
    await vcs.clonePlatformCheckout(repoPath, workspace);

    // Baseline is captured at seed time, before any agent commit is pulled in.
    const baseline = (await vcs.revParse(workspace, "HEAD"))!;

    // Remote agent: clone, edit (add/modify/delete), commit, push.
    const agentClone = join(home, "agent-clone");
    await run(os, ["git", "clone", "-q", repoPath, agentClone], home);
    await run(os, ["git", "config", "user.email", "a@b.c"], agentClone);
    await run(os, ["git", "config", "user.name", "a"], agentClone);
    os.fs.writeFile(join(agentClone, "mod.txt"), "v1\nv2\n"); // modified
    os.fs.unlink(join(agentClone, "del.txt")); // deleted
    os.fs.writeFile(join(agentClone, "new.txt"), "fresh\n"); // added
    await run(os, ["git", "add", "-A"], agentClone);
    await run(os, ["git", "commit", "-qm", "agent change"], agentClone);
    await run(os, ["git", "push", "-q", "origin", "HEAD"], agentClone);

    await vcs.gitPull(workspace);

    return { workspace, baseline, repoPath };
  }

  it("diffNameStatus reports add/modify/delete from baseline..HEAD", async () => {
    const { os, vcs, home } = makeWorld();
    const { workspace, baseline } = await buildSession(os, vcs, home);

    const result = await vcs.diffNameStatus(workspace, baseline);

    const byPath = Object.fromEntries(
      result.files.map((f) => [f.path, f.status]),
    );
    expect(byPath["new.txt"]).toBe("added");
    expect(byPath["mod.txt"]).toBe("modified");
    expect(byPath["del.txt"]).toBe("deleted");
    // Unchanged files never appear.
    expect(byPath["keep.txt"]).toBeUndefined();
    expect(byPath["sub/nested.txt"]).toBeUndefined();

    expect(result.summary).toEqual({ added: 1, modified: 1, deleted: 1 });
    // Sizes are populated for the changed files.
    for (const f of result.files) {
      expect(typeof f.size).toBe("number");
    }
  }, 30000);

  it("diffFileRange returns hunks for a single file and no others", async () => {
    const { os, vcs, home } = makeWorld();
    const { workspace, baseline } = await buildSession(os, vcs, home);

    const { hunks } = await vcs.diffFileRange(workspace, baseline, "mod.txt");
    expect(hunks.length).toBeGreaterThan(0);
    const added = hunks.flatMap((h) => h.lines).filter((l) => l === "+v2");
    expect(added).toHaveLength(1);
  }, 30000);

  it("showFileAtRef resolves the before-bytes for modified and deleted files", async () => {
    const { os, vcs, home } = makeWorld();
    const { workspace, baseline } = await buildSession(os, vcs, home);

    const mod = await vcs.showFileAtRef(workspace, baseline, "mod.txt");
    expect(mod.exists).toBe(true);
    expect(mod.content).toBe("v1\n");

    const del = await vcs.showFileAtRef(workspace, baseline, "del.txt");
    expect(del.exists).toBe(true);
    expect(del.content).toBe("bye\n");

    // Added file is absent at baseline.
    const added = await vcs.showFileAtRef(workspace, baseline, "new.txt");
    expect(added.exists).toBe(false);
  }, 30000);

  it("advanceBaseline drops committed files while keeping the rest pending", async () => {
    const { os, vcs, home } = makeWorld();
    const { workspace, baseline } = await buildSession(os, vcs, home);

    // Selectively "commit" mod.txt (modified) and del.txt (deleted). The new
    // baseline must no longer report them, but new.txt stays pending and HEAD
    // is untouched.
    const headBefore = await vcs.revParse(workspace, "HEAD");
    const newBaseline = await vcs.advanceBaseline(workspace, baseline, [
      "mod.txt",
      "del.txt",
    ]);
    expect(newBaseline).toBeTruthy();
    expect(newBaseline).not.toBe(baseline);

    const after = await vcs.diffNameStatus(workspace, newBaseline!);
    expect(after.files.map((f) => f.path).sort()).toEqual(["new.txt"]);
    expect(after.files[0]?.status).toBe("added");

    // HEAD is unchanged by the baseline advance.
    expect(await vcs.revParse(workspace, "HEAD")).toBe(headBefore);
    // before-bytes still resolvable from the advanced baseline.
    const keep = await vcs.showFileAtRef(workspace, newBaseline!, "keep.txt");
    expect(keep.exists).toBe(true);
  }, 30000);

  it("produces identical detection for git and fossil upstreams", async () => {
    const { os, vcs, home } = makeWorld();

    // git upstream session.
    const gitResult = await (async () => {
      const gitBase = join(home, "git");
      mkdirSync(gitBase, { recursive: true });
      const { workspace, baseline } = await buildSession(os, vcs, gitBase);
      const r = await vcs.diffNameStatus(workspace, baseline);
      return r.files.map((f) => `${f.status}:${f.path}`).sort();
    })();

    // fossil upstream session: a non-git upstream (plain files) funnelled
    // through the fossil seed path, which produces an "Initial import" git
    // commit. The agent layers identical changes; detection reads only the
    // (always-git) agent-workspace, so the delta must match the git case.
    const fossilResult = await (async () => {
      const base = join(home, "fossil");
      mkdirSync(base, { recursive: true });
      const upstream = join(base, "upstream");
      mkdirSync(upstream, { recursive: true });
      os.fs.writeFile(join(upstream, "keep.txt"), "keep\n");
      os.fs.writeFile(join(upstream, "mod.txt"), "v1\n");
      os.fs.writeFile(join(upstream, "del.txt"), "bye\n");
      mkdirSync(join(upstream, "sub"), { recursive: true });
      os.fs.writeFile(join(upstream, "sub", "nested.txt"), "n1\n");

      const repoPath = join(base, "sess.git");
      await vcs.seedSessionRepo(upstream, "fossil", repoPath, "main");
      const workspace = join(base, "agent-workspace");
      await vcs.clonePlatformCheckout(repoPath, workspace);
      const baseline = (await vcs.revParse(workspace, "HEAD"))!;

      const agentClone = join(base, "agent-clone");
      await run(os, ["git", "clone", "-q", repoPath, agentClone], base);
      await run(os, ["git", "config", "user.email", "a@b.c"], agentClone);
      await run(os, ["git", "config", "user.name", "a"], agentClone);
      os.fs.writeFile(join(agentClone, "mod.txt"), "v1\nv2\n");
      os.fs.unlink(join(agentClone, "del.txt"));
      os.fs.writeFile(join(agentClone, "new.txt"), "fresh\n");
      await run(os, ["git", "add", "-A"], agentClone);
      await run(os, ["git", "commit", "-qm", "agent change"], agentClone);
      await run(os, ["git", "push", "-q", "origin", "HEAD"], agentClone);
      await vcs.gitPull(workspace);

      const r = await vcs.diffNameStatus(workspace, baseline);
      return r.files.map((f) => `${f.status}:${f.path}`).sort();
    })();

    expect(fossilResult).toEqual(gitResult);
  }, 30000);

  it("an empty range (HEAD === baseline) reports no changes", async () => {
    const { os, vcs, home } = makeWorld();
    const upstream = join(home, "upstream");
    await makeGitUpstream(os, upstream);
    const repoPath = join(home, "sess.git");
    await vcs.seedSessionRepo(upstream, "git", repoPath);
    const workspace = join(home, "agent-workspace");
    await vcs.clonePlatformCheckout(repoPath, workspace);
    const baseline = (await vcs.revParse(workspace, "HEAD"))!;

    const result = await vcs.diffNameStatus(workspace, baseline);
    expect(result.files).toHaveLength(0);
    expect(result.summary).toEqual({ added: 0, modified: 0, deleted: 0 });
  }, 30000);
});
