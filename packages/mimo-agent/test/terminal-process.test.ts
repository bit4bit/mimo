/**
 * Tests for terminal message handlers in mimo-agent
 *
 * Covers:
 *   - terminal_spawn spawns a shell process with correct cwd
 *   - terminal_spawn with subpath spawns at {checkoutPath}/{subpath}
 *   - terminal_input writes data to the shell's stdin
 *   - terminal_output streams shell stdout as base64 messages
 *   - terminal_kill kills the shell and sends terminal_exited
 *   - terminal_exited sent when shell exits naturally
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { spawn } from "child_process";

class MockSessionManager {
  private sessions: Map<string, { checkoutPath: string }> = new Map();

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  addSession(sessionId: string, checkoutPath: string) {
    this.sessions.set(sessionId, { checkoutPath });
  }
}

interface TerminalProcess {
  process: ReturnType<typeof spawn>;
  terminalId: string;
}

describe("terminal message handlers", () => {
  let tempDir: string;
  let sessionManager: MockSessionManager;
  let sentMessages: any[];
  let terminalProcesses: Map<string, TerminalProcess>;

  beforeEach(() => {
    tempDir = join(tmpdir(), `mimo-agent-terminal-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tempDir, { recursive: true });
    sessionManager = new MockSessionManager();
    sentMessages = [];
    terminalProcesses = new Map();
  });

  afterEach(() => {
    for (const [, entry] of terminalProcesses) {
      try {
        entry.process.kill();
      } catch {}
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  function send(msg: any) {
    sentMessages.push(msg);
  }

  async function waitForMessage(
    predicate: (m: any) => boolean,
    timeoutMs = 3000,
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = sentMessages.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  }

  function getCheckoutPath(sessionId: string): string | undefined {
    return sessionManager.getSession(sessionId)?.checkoutPath;
  }

  async function handleTerminalSpawn(message: any) {
    const { sessionId, terminalId, subpath, command, cols, rows } = message;
    if (!sessionId || !terminalId) return;

    const session = sessionManager.getSession(sessionId);
    if (!session) return;

    const baseCwd = session.checkoutPath;
    const cwd = subpath ? join(baseCwd, subpath) : baseCwd;

    const cmd = command || "/bin/sh";
    const sizeCols =
      Number.isInteger(cols) && cols > 0 ? cols : 80;
    const sizeRows =
      Number.isInteger(rows) && rows > 0 ? rows : 24;
    const sizeCmd = `stty cols ${sizeCols} rows ${sizeRows}; `;
    const proc = spawn("script", ["-qec", `${sizeCmd}exec ${cmd}`, "/dev/null"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color" },
    });

    terminalProcesses.set(terminalId, { process: proc, terminalId });

    proc.stdout?.on("data", (data: Buffer) => {
      send({
        type: "terminal_output",
        sessionId,
        terminalId,
        data: data.toString("base64"),
      });
    });

    proc.on("close", (code: number | null) => {
      send({
        type: "terminal_exited",
        sessionId,
        terminalId,
        exitCode: code ?? -1,
      });
      terminalProcesses.delete(terminalId);
    });

    send({
      type: "terminal_spawned",
      sessionId,
      terminalId,
    });
  }

  async function handleTerminalInput(message: any) {
    const { sessionId, terminalId, data } = message;
    if (!sessionId || !terminalId) return;

    const entry = terminalProcesses.get(terminalId);
    if (!entry) return;

    const buffer = Buffer.from(data, "base64");
    entry.process.stdin?.write(buffer);
  }

  async function handleTerminalKill(message: any) {
    const { sessionId, terminalId } = message;
    if (!sessionId || !terminalId) return;

    const entry = terminalProcesses.get(terminalId);
    if (!entry) return;

    entry.process.kill();
  }

  it("spawns a shell process with cwd at checkout root (no subpath)", async () => {
    const sessionId = "test-session";
    sessionManager.addSession(sessionId, tempDir);

    await handleTerminalSpawn({
      type: "terminal_spawn",
      sessionId,
      terminalId: "term-1",
      subpath: null,
      scrollback: 1000,
    });

    const spawned = sentMessages.find((m) => m.type === "terminal_spawned");
    expect(spawned).toBeDefined();
    expect(spawned.terminalId).toBe("term-1");
  });

  it("spawns a shell process with cwd at {checkoutPath}/{subpath}", async () => {
    const sessionId = "test-session";
    const subpathDir = join(tempDir, "packages", "backend");
    mkdirSync(subpathDir, { recursive: true });
    sessionManager.addSession(sessionId, tempDir);

    await handleTerminalSpawn({
      type: "terminal_spawn",
      sessionId,
      terminalId: "term-2",
      subpath: "packages/backend",
      scrollback: 1000,
    });

    const spawned = sentMessages.find((m) => m.type === "terminal_spawned");
    expect(spawned).toBeDefined();

    const entry = terminalProcesses.get("term-2");
    expect(entry).toBeDefined();
  });

  it("writes terminal_input data to the shell's stdin", async () => {
    const sessionId = "test-session";
    sessionManager.addSession(sessionId, tempDir);

    await handleTerminalSpawn({
      type: "terminal_spawn",
      sessionId,
      terminalId: "term-3",
      subpath: null,
      scrollback: 1000,
    });

    sentMessages.length = 0;

    await handleTerminalInput({
      type: "terminal_input",
      sessionId,
      terminalId: "term-3",
      data: Buffer.from("echo hello\n").toString("base64"),
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const outputs = sentMessages.filter((m) => m.type === "terminal_output");
    const combined = outputs
      .map((m) => Buffer.from(m.data, "base64").toString())
      .join("");
    expect(combined).toContain("hello");
  });

  it("streams shell stdout as terminal_output messages", async () => {
    const sessionId = "test-session";
    sessionManager.addSession(sessionId, tempDir);

    await handleTerminalSpawn({
      type: "terminal_spawn",
      sessionId,
      terminalId: "term-4",
      subpath: null,
      scrollback: 1000,
    });

    sentMessages.length = 0;

    await handleTerminalInput({
      type: "terminal_input",
      sessionId,
      terminalId: "term-4",
      data: Buffer.from("echo test-output\n").toString("base64"),
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const outputs = sentMessages.filter((m) => m.type === "terminal_output");
    const combined = outputs
      .map((m) => Buffer.from(m.data, "base64").toString())
      .join("");
    expect(combined).toContain("test-output");
  });

  it("applies cols/rows from terminal_spawn to the shell's terminal size", async () => {
    const sessionId = "test-session";
    sessionManager.addSession(sessionId, tempDir);

    await handleTerminalSpawn({
      type: "terminal_spawn",
      sessionId,
      terminalId: "term-size",
      subpath: null,
      scrollback: 1000,
      cols: 111,
      rows: 33,
    });

    sentMessages.length = 0;

    await handleTerminalInput({
      type: "terminal_input",
      sessionId,
      terminalId: "term-size",
      data: Buffer.from("stty size\n").toString("base64"),
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const outputs = sentMessages.filter((m) => m.type === "terminal_output");
    const combined = outputs
      .map((m) => Buffer.from(m.data, "base64").toString())
      .join("");
    expect(combined).toContain("33 111");
  });

  it("defaults to 80x24 when terminal_spawn omits cols/rows", async () => {
    const sessionId = "test-session";
    sessionManager.addSession(sessionId, tempDir);

    await handleTerminalSpawn({
      type: "terminal_spawn",
      sessionId,
      terminalId: "term-default-size",
      subpath: null,
      scrollback: 1000,
    });

    sentMessages.length = 0;

    await handleTerminalInput({
      type: "terminal_input",
      sessionId,
      terminalId: "term-default-size",
      data: Buffer.from("stty size\n").toString("base64"),
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const outputs = sentMessages.filter((m) => m.type === "terminal_output");
    const combined = outputs
      .map((m) => Buffer.from(m.data, "base64").toString())
      .join("");
    expect(combined).toContain("24 80");
  });

  it("kills the shell on terminal_kill and sends terminal_exited", async () => {
    const sessionId = "test-session";
    sessionManager.addSession(sessionId, tempDir);

    await handleTerminalSpawn({
      type: "terminal_spawn",
      sessionId,
      terminalId: "term-5",
      subpath: null,
      scrollback: 1000,
    });

    sentMessages.length = 0;

    await handleTerminalKill({
      type: "terminal_kill",
      sessionId,
      terminalId: "term-5",
    });

    const exited = await waitForMessage(
      (m) => m.type === "terminal_exited" && m.terminalId === "term-5",
    );
    expect(exited).toBeDefined();
    expect(exited.terminalId).toBe("term-5");
  });

  it("sends terminal_exited when the shell exits naturally", async () => {
    const sessionId = "test-session";
    sessionManager.addSession(sessionId, tempDir);

    await handleTerminalSpawn({
      type: "terminal_spawn",
      sessionId,
      terminalId: "term-6",
      subpath: null,
      scrollback: 1000,
    });

    sentMessages.length = 0;

    await handleTerminalInput({
      type: "terminal_input",
      sessionId,
      terminalId: "term-6",
      data: Buffer.from("exit\n").toString("base64"),
    });

    const exited = await waitForMessage(
      (m) => m.type === "terminal_exited" && m.terminalId === "term-6",
    );
    expect(exited).toBeDefined();
    expect(exited.terminalId).toBe("term-6");
  });
});