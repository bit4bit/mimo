import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";
import { Hono } from "hono";

describe("Session findByThreadAgentId", () => {
  let testHome: string;
  let sessionRepository: any;
  let projectRepository: any;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-thread-agent-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
    mkdirSync(testHome, { recursive: true });

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    sessionRepository = ctx.repos.sessions;
    projectRepository = ctx.repos.projects;
  });

  it("returns sessions that have at least one thread assigned to the agent", async () => {
    const project = await projectRepository.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await sessionRepository.create({
      name: "Agent Thread Session",
      projectId: project.id,
      owner: "testuser",
    });

    await sessionRepository.addChatThread(session.id, {
      name: "Thread A",
      model: "model-x",
      mode: "code",
      acpSessionId: null,
      assignedAgentId: "agent-1",
      state: "active",
    });

    const found = await sessionRepository.findByThreadAgentId("agent-1");

    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(session.id);
  });

  it("returns empty array when no threads are assigned to that agent", async () => {
    const project = await projectRepository.create({
      name: "Empty Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await sessionRepository.create({
      name: "No Agent Session",
      projectId: project.id,
      owner: "testuser",
    });

    await sessionRepository.addChatThread(session.id, {
      name: "Unassigned Thread",
      model: "model-x",
      mode: "code",
      acpSessionId: null,
      assignedAgentId: null,
      state: "active",
    });

    const found = await sessionRepository.findByThreadAgentId("agent-1");
    expect(found).toHaveLength(0);
  });

  it("does not return sessions with threads assigned to a different agent", async () => {
    const project = await projectRepository.create({
      name: "Multi-agent Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await sessionRepository.create({
      name: "Other Agent Session",
      projectId: project.id,
      owner: "testuser",
    });

    await sessionRepository.addChatThread(session.id, {
      name: "Other Thread",
      model: "model-x",
      mode: "code",
      acpSessionId: null,
      assignedAgentId: "agent-other",
      state: "active",
    });

    const found = await sessionRepository.findByThreadAgentId("agent-1");
    expect(found).toHaveLength(0);
  });

  it("persists and reloads brainWash field via updateChatThread", async () => {
    const project = await projectRepository.create({
      name: "BrainWash Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await sessionRepository.create({
      name: "BrainWash Session",
      projectId: project.id,
      owner: "testuser",
    });

    await sessionRepository.addChatThread(session.id, {
      name: "BrainWash Thread",
      model: "model-x",
      mode: "code",
      acpSessionId: null,
      assignedAgentId: "agent-1",
      state: "active",
    });

    const freshSession = await sessionRepository.findById(session.id);
    const thread = freshSession!.chatThreads[0];
    expect(thread.brainWash).toBe(false);

    await sessionRepository.updateChatThread(session.id, thread.id, {
      brainWash: true,
    });

    const updated = await sessionRepository.findById(session.id);
    expect(updated!.chatThreads[0].brainWash).toBe(true);
  });

  it("brainWash defaults to false for threads loaded from YAML without the field", async () => {
    const project = await projectRepository.create({
      name: "BackCompat Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await sessionRepository.create({
      name: "BackCompat Session",
      projectId: project.id,
      owner: "testuser",
    });

    await sessionRepository.addChatThread(session.id, {
      name: "Legacy Thread",
      model: "model-x",
      mode: "code",
      acpSessionId: null,
      assignedAgentId: null,
      state: "active",
    });

    const loaded = await sessionRepository.findById(session.id);
    expect(loaded!.chatThreads[0].brainWash).toBe(false);
  });
});

describe("Session creation without agent assignment", () => {
  let testHome: string;
  let sessionRepository: any;
  let projectRepository: any;
  let userRepository: any;
  let app: any;
  let token: string;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-session-create-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
    mkdirSync(testHome, { recursive: true });

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    userRepository = ctx.repos.users;
    sessionRepository = ctx.repos.sessions;
    projectRepository = ctx.repos.projects;

    await userRepository.create(
      "testuser",
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
    );
    token = await ctx.services.auth.generateToken("testuser");
  });

  it("creates session without assignedAgentId even when provided in body", async () => {
    const project = await projectRepository.create({
      name: "No Agent Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await sessionRepository.create({
      name: "Test Session",
      projectId: project.id,
      owner: "testuser",
    });

    expect(session.assignedAgentId).toBeUndefined();
  });
});
