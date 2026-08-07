import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { dump } from "js-yaml";

import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

/**
 * Seeds an agent with a fixed id owned by `owner` so chat-thread assignment
 * (which now authorizes the assigned agent) accepts it.
 */
function seedAgent(home: string, id: string, owner: string) {
  const dir = join(home, "agents", id);
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    join(dir, "agent.yaml"),
    dump({
      id,
      name: id,
      owner,
      token: "seed-token",
      sessionIds: [],
      status: "offline",
      provider: "opencode",
      startedAt: now,
      updatedAt: now,
      sharedWith: [],
    }),
    { encoding: "utf-8" },
  );
}

let testHome: string;
let mimoContext: any;
let sessionRepository: any;
let projectRepository: any;
let userRepository: any;
let authService: any;
let agentService: any;
let chatService: any;

// Helper to create test app with internal API mounted
function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");

  const app = new Hono();

  // Mount internal API
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

  // Mount session routes with fetchFn that routes through app
  const sessions = createSessionsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const path = new URL(urlStr).pathname;
        return app.request(path, init);
      }
      return fetch(url, init);
    },
  });
  app.route("/projects/:projectId/sessions", sessions);

  return app;
}

describe("Chat Thread Instructions", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-instructions-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "test-secret",
        PLATFORM_URL: "http://localhost:3000",
      },
      services: { sharedVcs: new DummyGitHttpServer() },
    });

    mimoContext = ctx;
    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;
    authService = ctx.services.auth;
    agentService = ctx.services.agents;
    chatService = ctx.services.chat;

    // Mock VCS to avoid real git/fossil operations
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

  async function setupUserProjectSession(agentId?: string) {
    const app = createTestApp(mimoContext);

    await userRepository.create(
      "owner",
      await Bun.password.hash("pass", { algorithm: "bcrypt", cost: 10 }),
    );
    const token = await authService.generateToken("owner");

    const project = await projectRepository.create({
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/user/repo.git",
          repoType: "git",
          mountPath: ".",
        },
      ],

      name: "Test Project",
      owner: "owner",
    });

    // These tests assign "agent-1" to threads/sessions; seed it (and any
    // explicitly requested agentId) owned by "owner" so assignment is authorized.
    seedAgent(testHome, "agent-1", "owner");
    if (agentId && agentId !== "agent-1") {
      seedAgent(testHome, agentId, "owner");
    }

    const session = await sessionRepository.create({
      name: "Test Session",
      projectId: project.id,
      owner: "owner",
      assignedAgentId: agentId,
    });

    return { app, project, session, token };
  }

  describe("Project-level instructions", () => {
    it("when a thread is created, project instructions are saved as a system message in chat history", async () => {
      const { app, project, session, token } =
        await setupUserProjectSession("agent-1");

      // Update project with default instructions
      await projectRepository.update(project.id, {
        instructions:
          "Before performing any task, try to locate and read the file `AGENTS.md` if not found inform the user and continue.",
      });

      // Create thread
      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Coder",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-1",
          }),
        },
      );

      expect(res.status).toBe(201);
      const thread = await res.json();

      // Verify chat history has system message with instructions
      const history = await chatService.loadHistory(session.id, thread.id);
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe("system");
      expect(history[0].content).toBe(
        "Before performing any task, try to locate and read the file `AGENTS.md` if not found inform the user and continue.",
      );
    });
  });

  describe("Session-level instructions override project", () => {
    it("when both project and session have instructions, session instructions are used", async () => {
      const { app, project, session, token } =
        await setupUserProjectSession("agent-1");

      await projectRepository.update(project.id, {
        instructions:
          "Before performing any task, try to locate and read the file `AGENTS.md` if not found inform the user and continue.",
      });
      await sessionRepository.update(session.id, {
        instructions: "Session: Focus on Django ORM.",
      });

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Coder",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-1",
          }),
        },
      );

      expect(res.status).toBe(201);
      const thread = await res.json();

      const history = await chatService.loadHistory(session.id, thread.id);
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe("system");
      expect(history[0].content).toBe("Session: Focus on Django ORM.");
    });
  });

  describe("Thread-level instructions override session", () => {
    it("when thread has instructions, they take precedence over session and project", async () => {
      const { app, project, session, token } =
        await setupUserProjectSession("agent-1");

      await projectRepository.update(project.id, {
        instructions:
          "Before performing any task, try to locate and read the file `AGENTS.md` if not found inform the user and continue.",
      });
      await sessionRepository.update(session.id, {
        instructions: "Session: Focus on Django ORM.",
      });

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Coder",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-1",
            instructions: "Thread: Refactor this specific view.",
          }),
        },
      );

      expect(res.status).toBe(201);
      const thread = await res.json();

      const history = await chatService.loadHistory(session.id, thread.id);
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe("system");
      expect(history[0].content).toBe("Thread: Refactor this specific view.");
    });
  });

  describe("No instructions", () => {
    it("when no instructions exist at any level, no system message is added", async () => {
      const { app, project, session, token } =
        await setupUserProjectSession("agent-1");

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Coder",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-1",
          }),
        },
      );

      expect(res.status).toBe(201);
      const thread = await res.json();

      const history = await chatService.loadHistory(session.id, thread.id);
      expect(history).toHaveLength(0);
    });
  });

  describe("Instructions API", () => {
    it("PUT /projects/:id updates project instructions", async () => {
      const { app, project, token } = await setupUserProjectSession();

      const res = await app.request(`/api/internal/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instructions: "New project instructions",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.project.instructions).toBe("New project instructions");
    });

    it("PUT /sessions/:id updates session instructions", async () => {
      const { app, project, session, token } = await setupUserProjectSession();

      const res = await app.request(`/api/internal/sessions/${session.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instructions: "New session instructions",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.session.instructions).toBe("New session instructions");
    });

    it("PUT /sessions/:id/chat-threads/:threadId updates thread instructions", async () => {
      const { app, project, session, token } =
        await setupUserProjectSession("agent-1");

      const createRes = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Coder",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-1",
          }),
        },
      );
      const thread = await createRes.json();

      const res = await app.request(
        `/api/internal/sessions/${session.id}/chat-threads/${thread.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            instructions: "New thread instructions",
          }),
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.session.chatThreads[0].instructions).toBe(
        "New thread instructions",
      );
    });
  });
});
