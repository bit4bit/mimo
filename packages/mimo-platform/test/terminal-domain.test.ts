import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";

let testHome: string;
let sessionRepository: any;

beforeEach(async () => {
  testHome = join(
    tmpdir(),
    `mimo-terminal-domain-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  const { createMimoContext } =
    await import("../src/infrastructure/context/mimo-context.ts");
  const { DummyGitHttpServer } =
    await import("../src/domain/vcs/git-http-server.js");

  const ctx = createMimoContext({
    env: {
      MIMO_HOME: testHome,
      JWT_SECRET: "test-secret",
      PLATFORM_URL: "http://localhost:3000",
    },
    services: { sharedVcs: new DummyGitHttpServer() },
  });

  sessionRepository = ctx.repos.sessions;
  ctx.services.vcs.cloneRepository = async () => ({ success: true });
  ctx.services.vcs.importToFossil = async () => ({ success: true });
  ctx.services.vcs.seedSessionRepo = async () => ({ success: true });
  ctx.services.vcs.clonePlatformCheckout = async () => ({ success: true });
  ctx.services.vcs.syncIgnoresToGit = async () => ({ success: true });
  ctx.services.vcs.openFossilCheckout = async () => ({ success: true });
  ctx.services.vcs.openFossil = async () => ({ success: true });
  ctx.services.vcs.syncIgnoresToFossil = async () => ({ success: true });
});

afterEach(() => {
  try {
    rmSync(testHome, { recursive: true, force: true });
  } catch {}
});

async function createSession() {
  const projectDir = join(testHome, "projects", "test-project");
  mkdirSync(projectDir, { recursive: true });

  const session = await sessionRepository.create({
    name: "Test Session",
    projectId: "test-project",
    owner: "owner",
  });
  return session;
}

describe("Terminal domain model & persistence", () => {
  it("creating a terminal persists it in session.yaml with all fields", async () => {
    const session = await createSession();

    const terminal = await sessionRepository.addTerminal(session.id, {
      name: "build-shell",
      assignedAgentId: "agent-01",
      command: "bash -l",
      subpath: "packages/backend",
      scrollback: 5000,
    });

    expect(terminal.id).toBeDefined();
    expect(terminal.name).toBe("build-shell");
    expect(terminal.assignedAgentId).toBe("agent-01");
    expect(terminal.command).toBe("bash -l");
    expect(terminal.subpath).toBe("packages/backend");
    expect(terminal.scrollback).toBe(5000);
    expect(terminal.state).toBe("active");
    expect(terminal.createdAt).toBeDefined();

    const reloaded = await sessionRepository.findById(session.id);
    expect(reloaded!.terminals).toHaveLength(1);
    expect(reloaded!.terminals[0].name).toBe("build-shell");
    expect(reloaded!.terminals[0].command).toBe("bash -l");
    expect(reloaded!.terminals[0].state).toBe("active");
  });

  it("listing terminals for a session returns all persisted terminals", async () => {
    const session = await createSession();

    await sessionRepository.addTerminal(session.id, {
      name: "term-1",
      assignedAgentId: "agent-01",
      scrollback: 1000,
    });
    await sessionRepository.addTerminal(session.id, {
      name: "term-2",
      assignedAgentId: "agent-01",
      scrollback: 2000,
    });

    const reloaded = await sessionRepository.findById(session.id);
    expect(reloaded!.terminals).toHaveLength(2);
    expect(reloaded!.terminals[0].name).toBe("term-1");
    expect(reloaded!.terminals[1].name).toBe("term-2");
  });

  it("deleting a terminal removes it from session.yaml", async () => {
    const session = await createSession();

    const terminal = await sessionRepository.addTerminal(session.id, {
      name: "to-delete",
      assignedAgentId: "agent-01",
      scrollback: 1000,
    });

    await sessionRepository.removeTerminal(session.id, terminal.id);

    const reloaded = await sessionRepository.findById(session.id);
    expect(reloaded!.terminals).toHaveLength(0);
  });

  it("creating a terminal without subpath leaves subpath undefined (checkout root)", async () => {
    const session = await createSession();

    const terminal = await sessionRepository.addTerminal(session.id, {
      name: "root-shell",
      assignedAgentId: "agent-01",
      scrollback: 1000,
    });

    expect(terminal.subpath).toBeUndefined();
    expect(terminal.command).toBe("/bin/sh");

    const reloaded = await sessionRepository.findById(session.id);
    expect(reloaded!.terminals[0].subpath).toBeUndefined();
    expect(reloaded!.terminals[0].command).toBe("/bin/sh");
  });

  it("creating a terminal persists cols and rows", async () => {
    const session = await createSession();

    const terminal = await sessionRepository.addTerminal(session.id, {
      name: "sized-shell",
      assignedAgentId: "agent-01",
      scrollback: 1000,
      cols: 132,
      rows: 43,
    });

    expect(terminal.cols).toBe(132);
    expect(terminal.rows).toBe(43);

    const reloaded = await sessionRepository.findById(session.id);
    expect(reloaded!.terminals[0].cols).toBe(132);
    expect(reloaded!.terminals[0].rows).toBe(43);
  });

  it("creating a terminal without cols/rows defaults to 80x24", async () => {
    const session = await createSession();

    const terminal = await sessionRepository.addTerminal(session.id, {
      name: "default-size-shell",
      assignedAgentId: "agent-01",
      scrollback: 1000,
    });

    expect(terminal.cols).toBe(80);
    expect(terminal.rows).toBe(24);

    const reloaded = await sessionRepository.findById(session.id);
    expect(reloaded!.terminals[0].cols).toBe(80);
    expect(reloaded!.terminals[0].rows).toBe(24);
  });

  it("new session starts with empty terminals array", async () => {
    const session = await createSession();

    const reloaded = await sessionRepository.findById(session.id);
    expect(reloaded!.terminals).toEqual([]);
  });
});
