import { describe, it, expect, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { VCS } from "../src/domain/vcs/index.js";

describe("VCS git session repo", () => {
  const cleanups: string[] = [];
  afterEach(() => {
    for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function makeWorld() {
    const os = createOS({ ...process.env });
    const vcs = new VCS({ os });
    const home = join(
      tmpdir(),
      `mimo-vcs-git-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(home, { recursive: true });
    cleanups.push(home);
    return { os, vcs, home };
  }

  const run = (os: any, cmd: string[], cwd: string) =>
    os.command.run(cmd, { cwd, timeoutMs: 30000 });

  // A git upstream checkout with one commit on `main`.
  async function makeGitUpstream(os: any, dir: string) {
    mkdirSync(dir, { recursive: true });
    await run(os, ["git", "init", "-q", "-b", "main"], dir);
    await run(os, ["git", "config", "user.email", "a@b.c"], dir);
    await run(os, ["git", "config", "user.name", "a"], dir);
    os.fs.writeFile(join(dir, "f.txt"), "hello\n");
    await run(os, ["git", "add", "-A"], dir);
    await run(os, ["git", "commit", "-qm", "seed"], dir);
  }

  it("seeds a bare repo from a git upstream with receivepack enabled", async () => {
    const { os, vcs, home } = makeWorld();
    const upstream = join(home, "upstream");
    await makeGitUpstream(os, upstream);

    const repoPath = join(home, "sess.git");
    const result = await vcs.seedSessionRepo(upstream, "git", repoPath);
    expect(result.success).toBe(true);
    expect(os.fs.exists(join(repoPath, "HEAD"))).toBe(true);

    const rcv = await run(os, ["git", "config", "http.receivepack"], repoPath);
    expect(rcv.output.trim()).toBe("true");

    const log = await run(os, ["git", "log", "--oneline"], repoPath);
    expect(log.output).toContain("seed");
  });

  it("seeds from a fossil-style upstream as a single import commit", async () => {
    const { os, vcs, home } = makeWorld();
    // Simulate a non-git upstream working tree (plain files).
    const upstream = join(home, "upstream-fossil");
    mkdirSync(upstream, { recursive: true });
    os.fs.writeFile(join(upstream, "a.txt"), "data\n");

    const repoPath = join(home, "sessf.git");
    const result = await vcs.seedSessionRepo(upstream, "fossil", repoPath, "main");
    expect(result.success).toBe(true);

    const log = await run(os, ["git", "log", "--oneline"], repoPath);
    expect(log.output).toContain("Initial import");
  });

  it("clones a platform checkout and fast-forwards after an agent push", async () => {
    const { os, vcs, home } = makeWorld();
    const upstream = join(home, "upstream");
    await makeGitUpstream(os, upstream);
    const repoPath = join(home, "sess.git");
    await vcs.seedSessionRepo(upstream, "git", repoPath);

    // Platform checkout.
    const platformCheckout = join(home, "agent-workspace");
    const co = await vcs.clonePlatformCheckout(repoPath, platformCheckout);
    expect(co.success).toBe(true);
    expect(os.fs.exists(join(platformCheckout, "f.txt"))).toBe(true);

    // Simulate the remote agent: clone, change, push.
    const agentClone = join(home, "agent-clone");
    await run(os, ["git", "clone", "-q", repoPath, agentClone], home);
    await run(os, ["git", "config", "user.email", "a@b.c"], agentClone);
    await run(os, ["git", "config", "user.name", "a"], agentClone);
    os.fs.appendFile(join(agentClone, "f.txt"), "world\n");
    await run(os, ["git", "commit", "-qam", "agent change"], agentClone);
    const push = await run(os, ["git", "push", "-q", "origin", "HEAD"], agentClone);
    expect(push.success).toBe(true);

    // Platform refresh.
    const pull = await vcs.gitPull(platformCheckout);
    expect(pull.success).toBe(true);
    expect(os.fs.readFile(join(platformCheckout, "f.txt"), "utf8")).toContain("world");
  });

  it("seeds a self-contained repo from an alternates-backed upstream", async () => {
    const { os, vcs, home } = makeWorld();
    const run = (cmd: string[], cwd: string) =>
      os.command.run(cmd, { cwd, timeoutMs: 30000 });

    // origin repo
    const origin = join(home, "origin");
    await makeGitUpstream(os, origin);
    // project cache (bare clone of origin)
    const cache = join(home, "cache.git");
    await run(["git", "clone", "-q", "--bare", origin, cache], home);
    // upstream checkout created WITH --reference → borrows via alternates
    const upstream = join(home, "upstream");
    await run(["git", "clone", "-q", "--reference", cache, origin, upstream], home);
    expect(os.fs.exists(join(upstream, ".git", "objects", "info", "alternates"))).toBe(true);

    const repoPath = join(home, "sess.git");
    const result = await vcs.seedSessionRepo(upstream, "git", repoPath);
    expect(result.success).toBe(true);

    // The seed must be self-contained: no alternates file.
    expect(os.fs.exists(join(repoPath, "objects", "info", "alternates"))).toBe(false);

    // Deleting the cache must NOT break cloning from the seed.
    rmSync(cache, { recursive: true, force: true });
    rmSync(upstream, { recursive: true, force: true });
    const dest = join(home, "agent-clone");
    const clone = await run(["git", "clone", "-q", repoPath, dest], home);
    expect(clone.success).toBe(true);
    expect(os.fs.exists(join(dest, "f.txt"))).toBe(true);
  });

  it("writes .git/info/exclude from EXCLUDED_PATHS and ignore files", async () => {
    const { os, vcs, home } = makeWorld();
    const upstream = join(home, "upstream");
    await makeGitUpstream(os, upstream);
    os.fs.writeFile(join(upstream, ".mimoignore"), "secret.txt\n");
    const repoPath = join(home, "sess.git");
    await vcs.seedSessionRepo(upstream, "git", repoPath);
    const checkout = join(home, "agent-workspace");
    await vcs.clonePlatformCheckout(repoPath, checkout);

    const res = await vcs.syncIgnoresToGit(upstream, checkout);
    expect(res.success).toBe(true);
    const exclude = os.fs.readFile(join(checkout, ".git", "info", "exclude"), "utf8");
    expect(exclude).toContain("secret.txt");
    expect(exclude).toContain(".hg");
  });
});
