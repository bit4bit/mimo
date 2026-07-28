import { describe, it, expect, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { VCS } from "../src/domain/vcs/index.js";

describe("VCS resolveRootCommit", () => {
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
      `mimo-vcs-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(home, { recursive: true });
    cleanups.push(home);
    return { os, vcs, home };
  }

  const run = (os: any, cmd: string[], cwd: string) =>
    os.command.run(cmd, { cwd, timeoutMs: 30000 });

  async function makeGitRepo(os: any, dir: string) {
    mkdirSync(dir, { recursive: true });
    await run(os, ["git", "init", "-q", "-b", "main"], dir);
    await run(os, ["git", "config", "user.email", "a@b.c"], dir);
    await run(os, ["git", "config", "user.name", "a"], dir);
    os.fs.writeFile(join(dir, "f.txt"), "hello\n");
    await run(os, ["git", "add", "-A"], dir);
    await run(os, ["git", "commit", "-qm", "seed"], dir);
  }

  it("returns the root commit SHA (the commit with no parents)", async () => {
    const { os, vcs, home } = makeWorld();
    const repo = join(home, "repo");
    await makeGitRepo(os, repo);

    const rootSha = await vcs.resolveRootCommit(repo);
    expect(rootSha).not.toBeNull();
    expect(typeof rootSha).toBe("string");
    expect(rootSha!.length).toBe(40);

    // The root commit has no parents.
    const parents = await run(os, ["git", "rev-list", "--parents", "-n", "1", rootSha!], repo);
    const parts = parents.output.trim().split(/\s+/);
    expect(parts.length).toBe(1);
  });

  it("returns null when the workspace has no commits", async () => {
    const { os, vcs, home } = makeWorld();
    const repo = join(home, "empty");
    mkdirSync(repo, { recursive: true });
    await run(os, ["git", "init", "-q", "-b", "main"], repo);

    const rootSha = await vcs.resolveRootCommit(repo);
    expect(rootSha).toBeNull();
  });

  it("finds the seeded root commit in a --depth=1 clone seeded the same way the platform seeds it", async () => {
    const { os, vcs, home } = makeWorld();
    // Build an upstream with a seed commit, mirroring clonePlatformCheckout input.
    const upstream = join(home, "upstream");
    await makeGitRepo(os, upstream);

    // Seed a bare session repo (as the platform does).
    const repoPath = join(home, "sess.git");
    const seedResult = await vcs.seedSessionRepo(upstream, "git", repoPath);
    expect(seedResult.success).toBe(true);

    // Clone as the platform does (clonePlatformCheckout uses --depth=1).
    const checkout = join(home, "agent-workspace");
    const co = await vcs.clonePlatformCheckout(repoPath, checkout);
    expect(co.success).toBe(true);

    // Add an agent commit on top.
    os.fs.writeFile(join(checkout, "new.txt"), "agent work\n");
    await run(os, ["git", "config", "user.email", "a@b.c"], checkout);
    await run(os, ["git", "config", "user.name", "a"], checkout);
    await run(os, ["git", "add", "-A"], checkout);
    await run(os, ["git", "commit", "-qm", "agent change"], checkout);

    const rootSha = await vcs.resolveRootCommit(checkout);
    expect(rootSha).not.toBeNull();

    // The root commit should be the seeded "Initial import" / seed commit,
    // distinct from HEAD.
    const headSha = await run(os, ["git", "rev-parse", "HEAD"], checkout);
    expect(rootSha).not.toBe(headSha.output.trim());
  });
});