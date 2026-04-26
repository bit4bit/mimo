import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SessionManager } from "../src/session";
import type { FileChange } from "../src/types";
import { createOS } from "../src/os/node-adapter.js";

describe("SessionManager file watcher — hidden files", () => {
  let workDir: string;
  let receivedChanges: FileChange[];
  let manager: SessionManager;
  let os: ReturnType<typeof createOS>;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "mimo-agent-hidden-"));
    receivedChanges = [];
    os = createOS({ ...process.env });
    manager = new SessionManager(
      workDir,
      {
        onFileChange: (_sessionId, changes) => {
          receivedChanges.push(...changes);
        },
        onSessionError: () => {},
      },
      os,
    );
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  async function waitForChanges(ms = 800): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  it("emits change event when a hidden file is written in checkout", async () => {
    const sessionId = "test-hidden-file";
    await manager.createSession(sessionId, "http://localhost/repo");

    const checkoutPath = join(workDir, sessionId);
    writeFileSync(join(checkoutPath, ".claude"), "model: sonnet");

    await waitForChanges();

    const paths = receivedChanges.map((c) => c.path);
    expect(paths.some((p) => p.includes(".claude"))).toBe(true);
  });

  it("emits change event when a file inside a hidden directory is written", async () => {
    const sessionId = "test-hidden-dir";
    await manager.createSession(sessionId, "http://localhost/repo");

    const checkoutPath = join(workDir, sessionId);
    mkdirSync(join(checkoutPath, ".opencode"), { recursive: true });
    writeFileSync(join(checkoutPath, ".opencode", "config.json"), "{}");

    await waitForChanges();

    const paths = receivedChanges.map((c) => c.path);
    expect(paths.some((p) => p.includes(".opencode"))).toBe(true);
  });

  it("does not emit change for .fossil VCS internal file", async () => {
    const sessionId = "test-fossil-internal";
    await manager.createSession(sessionId, "http://localhost/repo");

    const checkoutPath = join(workDir, sessionId);
    writeFileSync(join(checkoutPath, ".fossil"), "fossil-data");

    await waitForChanges();

    const paths = receivedChanges.map((c) => c.path);
    expect(paths.some((p) => p.includes(".fossil"))).toBe(false);
  });

  it("does not emit change for files matching .gitignore patterns", async () => {
    const sessionId = "test-gitignore";
    const checkoutPath = join(workDir, sessionId);
    mkdirSync(join(checkoutPath, "dist"), { recursive: true });
    writeFileSync(join(checkoutPath, ".gitignore"), "dist/\n");

    await manager.createSession(sessionId, "http://localhost/repo");

    writeFileSync(join(checkoutPath, "dist", "bundle.js"), "bundle");

    await waitForChanges(1200);

    const paths = receivedChanges.map((c) => c.path);
    expect(paths.some((p) => p === "dist/bundle.js")).toBe(false);
  });

  it("does not emit change for files matching .mimoignore patterns", async () => {
    const sessionId = "test-mimoignore";
    const checkoutPath = join(workDir, sessionId);
    mkdirSync(checkoutPath, { recursive: true });
    writeFileSync(join(checkoutPath, ".mimoignore"), "*.generated.ts\n");

    await manager.createSession(sessionId, "http://localhost/repo");

    writeFileSync(join(checkoutPath, "types.generated.ts"), "export {};\n");

    await waitForChanges(1200);

    const paths = receivedChanges.map((c) => c.path);
    expect(paths.some((p) => p === "types.generated.ts")).toBe(false);
  });

  it("does not emit change for built-in ignored patterns", async () => {
    const sessionId = "test-built-ins";
    await manager.createSession(sessionId, "http://localhost/repo");

    const checkoutPath = join(workDir, sessionId);
    mkdirSync(join(checkoutPath, "node_modules"), { recursive: true });
    writeFileSync(join(checkoutPath, "node_modules", "dep.js"), "dep");
    mkdirSync(join(checkoutPath, "__pycache__"), { recursive: true });
    writeFileSync(join(checkoutPath, "__pycache__", "mod.pyc"), "pyc");
    mkdirSync(join(checkoutPath, ".git"), { recursive: true });
    writeFileSync(join(checkoutPath, ".git", "config"), "config");
    writeFileSync(join(checkoutPath, "temp.tmp"), "tmp");
    writeFileSync(join(checkoutPath, "scratch~"), "tilde");

    await waitForChanges(1400);

    const paths = receivedChanges.map((c) => c.path);
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(paths.some((p) => p.includes("__pycache__"))).toBe(false);
    expect(paths.some((p) => p.startsWith(".git"))).toBe(false);
    expect(paths.some((p) => p.endsWith(".tmp"))).toBe(false);
    expect(paths.some((p) => p.endsWith("~"))).toBe(false);
  });
});
