import { describe, it, expect, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { GitHttpServer } from "../src/domain/vcs/git-http-server.js";
import { findAvailablePort } from "./test-helpers.js";

const USER = "alice";
const PASS = "s3cret";

describe("GitHttpServer Integration", () => {
  const cleanups: Array<() => void | Promise<void>> = [];

  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });

  async function makeServer(
    verify = (sid: string, u: string, p: string) => u === USER && p === PASS,
  ) {
    const os = createOS({ ...process.env });
    const port = await findAvailablePort();
    const home = join(
      tmpdir(),
      `mimo-git-http-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const reposDir = join(home, "session-repos");
    mkdirSync(reposDir, { recursive: true });

    const server = new GitHttpServer(
      { port, reposDir, host: "localhost", verifyCredentials: verify },
      os,
    );
    cleanups.push(async () => {
      await server.stop();
      rmSync(home, { recursive: true, force: true });
    });
    const started = await server.start();
    expect(started).toBe(true);
    return { os, server, reposDir, home, port };
  }

  // Seed a bare repo `<sid>.git` with one commit, push-enabled.
  async function seedBareRepo(os: any, reposDir: string, sid: string) {
    const work = join(reposDir, `_seed-${sid}`);
    const run = (cmd: string[], cwd: string) =>
      os.command.run(cmd, { cwd, timeoutMs: 30000 });
    mkdirSync(work, { recursive: true });
    await run(["git", "init", "-q"], work);
    await run(["git", "config", "user.email", "a@b.c"], work);
    await run(["git", "config", "user.name", "a"], work);
    os.fs.writeFile(join(work, "f.txt"), "hello\n");
    await run(["git", "add", "-A"], work);
    await run(["git", "commit", "-qm", "seed"], work);
    const bare = join(reposDir, `${sid}.git`);
    await run(["git", "clone", "-q", "--bare", work, bare], reposDir);
    await run(["git", "config", "http.receivepack", "true"], bare);
    rmSync(work, { recursive: true, force: true });
    return bare;
  }

  it("rejects clone without credentials (401)", async () => {
    const { os, reposDir, server } = await makeServer();
    const sid = "sess-aaa-111";
    await seedBareRepo(os, reposDir, sid);

    const res = await fetch(
      `${server.getUrl(sid)}info/refs?service=git-upload-pack`,
    );
    expect(res.status).toBe(401);
  });

  it("rejects clone with wrong credentials (401)", async () => {
    const { os, reposDir, server, port } = await makeServer();
    const sid = "sess-bbb-222";
    await seedBareRepo(os, reposDir, sid);

    const res = await fetch(
      `http://wrong:bad@localhost:${port}/${sid}.git/info/refs?service=git-upload-pack`,
    );
    expect(res.status).toBe(401);
  });

  it("clones with valid credentials", async () => {
    const { os, reposDir, home, port } = await makeServer();
    const sid = "sess-ccc-333";
    await seedBareRepo(os, reposDir, sid);

    const dest = join(home, "clone");
    const result = await os.command.run(
      [
        "git",
        "clone",
        "-q",
        `http://${USER}:${PASS}@localhost:${port}/${sid}.git`,
        dest,
      ],
      { timeoutMs: 30000 },
    );
    expect(result.success).toBe(true);
    expect(os.fs.exists(join(dest, "f.txt"))).toBe(true);
  });

  it("routes git HTTP requests by session and repository", async () => {
    const { os, reposDir, home, port, server } = await makeServer();
    const sid = "sess-multi-777";
    const repoId = "backend";
    const work = join(reposDir, `_seed-${sid}-${repoId}`);
    const run = (cmd: string[], cwd: string) =>
      os.command.run(cmd, { cwd, timeoutMs: 30000 });
    mkdirSync(work, { recursive: true });
    await run(["git", "init", "-q"], work);
    await run(["git", "config", "user.email", "a@b.c"], work);
    await run(["git", "config", "user.name", "a"], work);
    os.fs.writeFile(join(work, "backend.txt"), "backend\n");
    await run(["git", "add", "-A"], work);
    await run(["git", "commit", "-qm", "seed"], work);
    const bare = join(reposDir, `${sid}-${repoId}.git`);
    await run(["git", "clone", "-q", "--bare", work, bare], reposDir);
    await run(["git", "config", "http.receivepack", "true"], bare);
    rmSync(work, { recursive: true, force: true });

    const dest = join(home, "clone-backend");
    const result = await os.command.run(
      [
        "git",
        "clone",
        "-q",
        `http://${USER}:${PASS}@localhost:${port}${new URL(server.getUrl(sid, repoId)).pathname}`,
        dest,
      ],
      { timeoutMs: 30000 },
    );
    expect(result.success).toBe(true);
    expect(os.fs.exists(join(dest, "backend.txt"))).toBe(true);
  });

  it("clones a larger multi-commit repo over protocol v2", async () => {
    const { os, reposDir, home, port } = await makeServer();
    const sid = "sess-v2-555";

    // Build a multi-commit, multi-file repo so the packfile is non-trivial.
    const work = join(reposDir, `_seed-${sid}`);
    const run = (cmd: string[], cwd: string) =>
      os.command.run(cmd, { cwd, timeoutMs: 30000 });
    mkdirSync(work, { recursive: true });
    await run(["git", "init", "-q", "-b", "main"], work);
    await run(["git", "config", "user.email", "a@b.c"], work);
    await run(["git", "config", "user.name", "a"], work);
    for (let c = 0; c < 6; c++) {
      for (let f = 0; f < 20; f++) {
        os.fs.writeFile(
          join(work, `file-${c}-${f}.txt`),
          "x".repeat(500) + `\n${c}-${f}\n`,
        );
      }
      await run(["git", "add", "-A"], work);
      await run(["git", "commit", "-qm", `commit ${c}`], work);
    }
    const bare = join(reposDir, `${sid}.git`);
    await run(["git", "clone", "-q", "--bare", work, bare], reposDir);
    await run(["git", "config", "http.receivepack", "true"], bare);
    rmSync(work, { recursive: true, force: true });

    const dest = join(home, "clone-v2");
    const result = await os.command.run(
      [
        "git",
        "-c",
        "protocol.version=2",
        "clone",
        "-q",
        `http://${USER}:${PASS}@localhost:${port}/${sid}.git`,
        dest,
      ],
      { timeoutMs: 60000 },
    );
    expect(result.success).toBe(true);
    expect(os.fs.exists(join(dest, "file-5-19.txt"))).toBe(true);
    const log = await os.command.run(["git", "log", "--oneline"], {
      cwd: dest,
      timeoutMs: 30000,
    });
    expect(log.output).toContain("commit 5");
    expect(log.output).toContain("commit 0");
  });

  it("accepts an authenticated push (receivepack)", async () => {
    const { os, reposDir, home, port } = await makeServer();
    const sid = "sess-ddd-444";
    const bare = await seedBareRepo(os, reposDir, sid);

    const dest = join(home, "clone");
    const url = `http://${USER}:${PASS}@localhost:${port}/${sid}.git`;
    await os.command.run(["git", "clone", "-q", url, dest], {
      timeoutMs: 30000,
    });
    const run = (cmd: string[]) =>
      os.command.run(cmd, { cwd: dest, timeoutMs: 30000 });
    await run(["git", "config", "user.email", "a@b.c"]);
    await run(["git", "config", "user.name", "a"]);
    os.fs.appendFile(join(dest, "f.txt"), "world\n");
    await run(["git", "commit", "-qam", "change"]);
    const push = await run(["git", "push", "-q", "origin", "HEAD"]);
    expect(push.success).toBe(true);

    const log = await os.command.run(["git", "log", "--oneline"], {
      cwd: bare,
      timeoutMs: 30000,
    });
    expect(log.output).toContain("change");
  });
});
