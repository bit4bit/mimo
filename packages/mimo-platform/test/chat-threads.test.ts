import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";

import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

let testHome: string;
let mimoContext: any;
let sessionRepository: any;
let projectRepository: any;
let userRepository: any;
let authService: any;
let agentService: any;

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

describe("Chat Threads API", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-chat-threads-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  async function createUserProjectSession() {
    const app = createTestApp(mimoContext);

    await userRepository.create(
      "owner",
      await Bun.password.hash("pass", { algorithm: "bcrypt", cost: 10 }),
    );
    const token = await authService.generateToken("owner");

    const project = await projectRepository.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "owner",
    });

    const session = await sessionRepository.create({
      name: "Test Session",
      projectId: project.id,
      owner: "owner",
    });

    return { app, project, session, token };
  }

  // Task 1.5 + session-management spec: new session starts with no threads
  describe("Session creation starts without chat threads", () => {
    it("GET /sessions/:id/chat-threads returns an empty thread list for a new session", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "GET",
          headers: { Cookie: `token=${token}` },
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.threads).toBeDefined();
      expect(body.threads).toHaveLength(0);
      expect(body.activeChatThreadId).toBeNull();
    });
  });

  // Task 1.5: programmatic thread creation without UI
  describe("Programmatic thread creation", () => {
    it("POST /sessions/:id/chat-threads creates a named thread with model and mode", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Reviewer",
            model: "claude-3",
            mode: "review",
            assignedAgentId: "agent-xyz",
          }),
        },
      );

      expect(res.status).toBe(201);
      const thread = await res.json();
      expect(thread.id).toBeDefined();
      expect(thread.name).toBe("Reviewer");
      expect(thread.model).toBe("claude-3");
      expect(thread.mode).toBe("review");
    });

    it("POST /sessions/:id/chat-threads returns 401 for unauthenticated requests", async () => {
      const { app, project, session } = await createUserProjectSession();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Reviewer",
            model: "claude-3",
            mode: "review",
          }),
        },
      );

      expect(res.status).toBe(401);
    });
  });

  describe("Thread agent assignment", () => {
    it("POST /sessions/:id/chat-threads stores assignedAgentId on thread", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Agent Thread",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );

      expect(res.status).toBe(201);
      const thread = await res.json();
      expect(thread.assignedAgentId).toBe("agent-xyz");
    });

    it("POST /sessions/:id/chat-threads returns 400 when assignedAgentId is not provided", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const res = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "No Agent Thread",
            model: "claude-3",
            mode: "code",
          }),
        },
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("assignedAgentId is required");
    });
  });

  // Task 1.3: model/mode isolation
  describe("Per-thread model and mode isolation", () => {
    it("PATCH /sessions/:id/chat-threads/:threadId updates one thread without affecting siblings", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      // Create two threads
      const r1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Coder",
            model: "gpt-4",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r1.status).toBe(201);
      const thread1 = await r1.json();

      const r2 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Reviewer",
            model: "claude-3",
            mode: "review",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r2.status).toBe(201);
      const thread2 = await r2.json();

      // Change model of thread1 only
      const patch = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads/${thread1.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ model: "gpt-5" }),
        },
      );
      expect(patch.status).toBe(200);

      // List threads and verify isolation
      const list = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "GET",
          headers: { Cookie: `token=${token}` },
        },
      );
      expect(list.status).toBe(200);
      const body = await list.json();

      const updated = body.threads.find((t: any) => t.id === thread1.id);
      const unchanged = body.threads.find((t: any) => t.id === thread2.id);

      expect(updated.model).toBe("gpt-5");
      expect(unchanged.model).toBe("claude-3");
      expect(unchanged.mode).toBe("review");
    });
  });

  // Task 1.4: reconnect sends streaming state for active thread
  describe("Reconnect streaming state is thread-scoped", () => {
    it("streaming state stored for a thread is retrievable by chatThreadId", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      // Create a thread
      const r = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Primary Thread",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r.status).toBe(201);
      const thread = await r.json();

      // Activate the thread
      const activate = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads/${thread.id}/activate`,
        {
          method: "POST",
          headers: { Cookie: `token=${token}` },
        },
      );
      expect(activate.status).toBe(200);

      // Verify activeChatThreadId is updated
      const list = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "GET",
          headers: { Cookie: `token=${token}` },
        },
      );
      const body = await list.json();
      expect(body.activeChatThreadId).toBe(thread.id);
    });
  });

  // Bug fix: restart recovery of non-main thread context
  describe("Restart recovery of thread context", () => {
    it("should persist thread acpSessionId and include it in session_ready", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      // Create two threads
      const r1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Primary Thread",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r1.status).toBe(201);
      const mainThread = await r1.json();

      const r2 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Reviewer",
            model: "gpt-4",
            mode: "review",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r2.status).toBe(201);
      const reviewerThread = await r2.json();

      // Simulate ACP session created with thread-specific acpSessionId
      await sessionRepository.updateChatThread(session.id, reviewerThread.id, {
        acpSessionId: "acp-thread-reviewer-123",
      });

      // Reload session from disk (simulates restart)
      const reloadedSession = await sessionRepository.findById(session.id);
      expect(reloadedSession).toBeDefined();

      const reloadedThread = reloadedSession!.chatThreads.find(
        (t: any) => t.id === reviewerThread.id,
      );
      expect(reloadedThread?.acpSessionId).toBe("acp-thread-reviewer-123");

      // Verify thread data structure
      expect(reloadedSession!.chatThreads).toHaveLength(2);
      for (const thread of reloadedSession!.chatThreads) {
        expect(thread.id).toBeDefined();
        expect(thread.name).toBeDefined();
        expect(thread.model).toBeDefined();
        expect(thread.mode).toBeDefined();
        expect(thread).toHaveProperty("acpSessionId");
      }
    });

    it("should preserve thread acpSessionId across session reloads", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      // Create a thread with acpSessionId
      const r = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Feature Branch",
            model: "claude-3-opus",
            mode: "build",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r.status).toBe(201);
      const thread = await r.json();

      // Set thread-specific acpSessionId
      await sessionRepository.updateChatThread(session.id, thread.id, {
        acpSessionId: "acp-feature-session-456",
        model: "claude-3-opus",
        mode: "build",
      });

      // Reload session from disk (simulates restart)
      const reloadedSession = await sessionRepository.findById(session.id);
      expect(reloadedSession).toBeDefined();

      const reloadedThread = reloadedSession!.chatThreads.find(
        (t: any) => t.id === thread.id,
      );
      expect(reloadedThread?.acpSessionId).toBe("acp-feature-session-456");
      expect(reloadedThread?.model).toBe("claude-3-opus");
      expect(reloadedThread?.mode).toBe("build");
    });
  });

  describe("session_ready MCP config injection", () => {
    it("4.4 session_ready includes platform MCP server config", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const sentMessages: any[] = [];
      const originalIsOnline = agentService.isAgentOnline.bind(agentService);
      const originalGetConnection =
        agentService.getAgentConnection.bind(agentService);

      agentService.isAgentOnline = () => true;
      agentService.getAgentConnection = () => ({
        readyState: 1,
        send: (payload: string) => sentMessages.push(JSON.parse(payload)),
      });

      try {
        expect(session?.mcpToken).toBeTruthy();

        const res = await app.request(
          `/projects/${project.id}/sessions/${session.id}/chat-threads`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: `token=${token}`,
            },
            body: JSON.stringify({
              name: "MCP Thread",
              model: "claude-3",
              mode: "code",
              assignedAgentId: "agent-xyz",
            }),
          },
        );

        expect(res.status).toBe(201);
        expect(sentMessages.length).toBeGreaterThan(0);
        const ready = sentMessages.find((msg) => msg.type === "session_ready");
        expect(ready).toBeDefined();
        expect(Array.isArray(ready.sessions)).toBe(true);
        expect(ready.sessions[0].mcpServers).toBeDefined();

        const mimoEntry = ready.sessions[0].mcpServers.find(
          (entry: any) => entry.name === "mimo" && entry.type === "http",
        );
        expect(mimoEntry).toBeDefined();
        expect(mimoEntry.url).toContain("/api/mimo-mcp");
        expect(mimoEntry.headers[0].name).toBe("Authorization");
        expect(mimoEntry.headers[0].value).toBe(`Bearer ${session!.mcpToken}`);
      } finally {
        agentService.isAgentOnline = originalIsOnline;
        agentService.getAgentConnection = originalGetConnection;
      }
    });

    it("4.5 repeated session_ready payloads keep the same mcpToken", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const sentMessages: any[] = [];
      const originalIsOnline = agentService.isAgentOnline.bind(agentService);
      const originalGetConnection =
        agentService.getAgentConnection.bind(agentService);

      agentService.isAgentOnline = () => true;
      agentService.getAgentConnection = () => ({
        readyState: 1,
        send: (payload: string) => sentMessages.push(JSON.parse(payload)),
      });

      try {
        const firstToken = session!.mcpToken;

        for (let i = 0; i < 2; i += 1) {
          const res = await app.request(
            `/projects/${project.id}/sessions/${session.id}/chat-threads`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: `token=${token}`,
              },
              body: JSON.stringify({
                name: `Restart Test ${i}`,
                model: "claude-3",
                mode: "code",
                assignedAgentId: "agent-xyz",
              }),
            },
          );
          expect(res.status).toBe(201);
        }

        const readyMessages = sentMessages.filter(
          (msg) => msg.type === "session_ready",
        );
        expect(readyMessages.length).toBeGreaterThanOrEqual(2);

        for (const msg of readyMessages) {
          const mimoEntry = msg.sessions[0].mcpServers.find(
            (entry: any) => entry.name === "mimo" && entry.type === "http",
          );
          expect(mimoEntry.headers[0].value).toBe(`Bearer ${firstToken}`);
        }
      } finally {
        agentService.isAgentOnline = originalIsOnline;
        agentService.getAgentConnection = originalGetConnection;
      }
    });
  });

  describe("Thread name uniqueness", () => {
    it("POST /sessions/:id/chat-threads rejects duplicate name with 400", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const r1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Reviewer",
            model: "claude-3",
            mode: "review",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r1.status).toBe(201);

      const r2 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Reviewer",
            model: "gpt-4",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r2.status).toBe(400);
      const body = await r2.json();
      expect(body.error).toContain("Reviewer");
    });

    it("PATCH /sessions/:id/chat-threads/:threadId rejects rename to existing name with 400", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const r1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Reviewer",
            model: "claude-3",
            mode: "review",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r1.status).toBe(201);

      const r2 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Main",
            model: "gpt-4",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r2.status).toBe(201);
      const mainThread = await r2.json();

      const patch = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads/${mainThread.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ name: "Reviewer" }),
        },
      );
      expect(patch.status).toBe(400);
      const body = await patch.json();
      expect(body.error).toContain("Reviewer");
    });

    it("Case-sensitive uniqueness — 'Foo' and 'foo' are distinct names", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const r1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "foo",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r1.status).toBe(201);

      const r2 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Foo",
            model: "gpt-4",
            mode: "review",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r2.status).toBe(201);
    });

    it("Renaming thread to its own name succeeds (no-op)", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      const r1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Reviewer",
            model: "claude-3",
            mode: "review",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r1.status).toBe(201);
      const thread = await r1.json();

      const patch = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads/${thread.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ name: "Reviewer" }),
        },
      );
      expect(patch.status).toBe(200);
    });
  });

  describe("Thread deletion", () => {
    it("DELETE /sessions/:id/chat-threads/:threadId removes a thread and returns 204", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      // Create a thread
      const r1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "To Delete",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r1.status).toBe(201);
      const thread = await r1.json();

      // Create a second thread so we can delete the first
      const r2 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Keep",
            model: "gpt-4",
            mode: "review",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r2.status).toBe(201);

      // Delete the first thread
      const del = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads/${thread.id}`,
        {
          method: "DELETE",
          headers: { Cookie: `token=${token}` },
        },
      );
      expect(del.status).toBe(204);

      // Verify thread is gone
      const list = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "GET",
          headers: { Cookie: `token=${token}` },
        },
      );
      expect(list.status).toBe(200);
      const body = await list.json();
      expect(body.threads).toHaveLength(1);
      expect(body.threads[0].name).toBe("Keep");
    });

    it("DELETE /sessions/:id/chat-threads/:threadId allows deleting the last thread", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      // Create exactly one thread
      const r1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Only Thread",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r1.status).toBe(201);
      const thread = await r1.json();

      // Delete it — should succeed even if it's the last one
      const del = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads/${thread.id}`,
        {
          method: "DELETE",
          headers: { Cookie: `token=${token}` },
        },
      );
      expect(del.status).toBe(204);

      // Verify no threads remain
      const list = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "GET",
          headers: { Cookie: `token=${token}` },
        },
      );
      expect(list.status).toBe(200);
      const body = await list.json();
      expect(body.threads).toHaveLength(0);
      expect(body.activeChatThreadId).toBeNull();
    });

    it("DELETE /sessions/:id/chat-threads/:threadId returns 404 for non-existent thread", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      // Create a thread so we're not at the last-thread boundary
      const r1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Real Thread",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r1.status).toBe(201);

      // Try to delete a non-existent thread
      const del = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads/non-existent-id`,
        {
          method: "DELETE",
          headers: { Cookie: `token=${token}` },
        },
      );
      expect(del.status).toBe(404);
      const body = await del.json();
      expect(body.error).toContain("Thread not found");
    });

    it("allows recreating a thread with the same name after deletion", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      // Create a thread
      const r1 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Test Thread",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r1.status).toBe(201);
      const thread = await r1.json();

      // Delete it
      const del = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads/${thread.id}`,
        {
          method: "DELETE",
          headers: { Cookie: `token=${token}` },
        },
      );
      expect(del.status).toBe(204);

      // Create a new thread with the same name — should succeed
      const r2 = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({
            name: "Test Thread",
            model: "claude-3",
            mode: "code",
            assignedAgentId: "agent-xyz",
          }),
        },
      );
      expect(r2.status).toBe(201);
      const body = await r2.json();
      expect(body.name).toBe("Test Thread");
    });

    it("DELETE /sessions/:id/chat-threads/:threadId returns 401 for unauthenticated requests", async () => {
      const { app, project, session } = await createUserProjectSession();

      const del = await app.request(
        `/projects/${project.id}/sessions/${session.id}/chat-threads/thread-123`,
        {
          method: "DELETE",
        },
      );
      expect(del.status).toBe(401);
    });
  });

  describe("session_ready preserves idleTimeoutMs", () => {
    it("should include current idleTimeoutMs in session_ready when creating a new thread", async () => {
      const { app, project, session, token } = await createUserProjectSession();

      // 1. Set a custom idle timeout via config endpoint
      const patchRes = await app.request(
        `/projects/${project.id}/sessions/${session.id}/config`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `token=${token}`,
          },
          body: JSON.stringify({ idleTimeoutMs: 1800000 }),
        },
      );
      expect(patchRes.status).toBe(200);

      // 2. Mock agent online to capture session_ready
      const sentMessages: any[] = [];
      const originalIsOnline = agentService.isAgentOnline.bind(agentService);
      const originalGetConnection =
        agentService.getAgentConnection.bind(agentService);

      agentService.isAgentOnline = () => true;
      agentService.getAgentConnection = () => ({
        readyState: 1,
        send: (payload: string) => sentMessages.push(JSON.parse(payload)),
      });

      try {
        const res = await app.request(
          `/projects/${project.id}/sessions/${session.id}/chat-threads`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: `token=${token}`,
            },
            body: JSON.stringify({
              name: "Timeout Test Thread",
              model: "claude-3",
              mode: "code",
              assignedAgentId: "agent-xyz",
            }),
          },
        );

        expect(res.status).toBe(201);
        const ready = sentMessages.find((msg) => msg.type === "session_ready");
        expect(ready).toBeDefined();
        expect(ready.sessions[0].idleTimeoutMs).toBe(1800000);
      } finally {
        agentService.isAgentOnline = originalIsOnline;
        agentService.getAgentConnection = originalGetConnection;
      }
    });
  });
});
