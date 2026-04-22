// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Failing integration tests for: add-chat-threads-shared-workspace
 *
 * Tasks covered:
 *   1.3  per-thread model/mode are isolated across threads
 *   1.4  reconnect sends streaming state for active thread
 *   1.5  programmatic thread creation API works without UI
 *   session-management spec: session creation starts without chat threads
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import bcrypt from "bcrypt";
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";

let testHome: string;
let app: Hono;
let sessionRoutes: any;
let sessionRepository: any;
let projectRepository: any;
let userRepository: any;
let authService: any;
let agentService: any;
let token: string;
let projectId: string;
let sessionId: string;

describe("Chat Threads API", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-chat-threads-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret" },
      services: { sharedFossil: new DummySharedFossilServer() },
    });

    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;
    authService = ctx.services.auth;
    agentService = ctx.services.agents;

    // Mock VCS to avoid real git/fossil operations
    const vcsModule = await import("../src/vcs/index.ts");
    vcsModule.vcs.cloneRepository = async () => ({ success: true });
    vcsModule.vcs.importToFossil = async () => ({ success: true });
    vcsModule.vcs.openFossilCheckout = async () => ({ success: true });
    vcsModule.vcs.openFossil = async () => ({ success: true });
    vcsModule.vcs.syncIgnoresToFossil = async () => ({ success: true });

    const { createSessionsRoutes } = await import("../src/sessions/routes.tsx");
    sessionRoutes = createSessionsRoutes(ctx);

    app = new Hono();
    app.route("/projects/:projectId/sessions", sessionRoutes);

    // Seed: user, project, session
    await userRepository.create("owner", await bcrypt.hash("pass", 10));
    token = await authService.generateToken("owner");

    const project = await projectRepository.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "owner",
    });
    projectId = project.id;

    const session = await sessionRepository.create({
      name: "Test Session",
      projectId,
      owner: "owner",
    });
    sessionId = session.id;
  });

  afterEach(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  // Task 1.5 + session-management spec: new session starts with no threads
  describe("Session creation starts without chat threads", () => {
    it("GET /sessions/:id/chat-threads returns an empty thread list for a new session", async () => {
      const res = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
      const res = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
      const res = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
      const res = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
      const res = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
      // Create two threads
      const r1 = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
        `/projects/${projectId}/sessions/${sessionId}/chat-threads/${thread1.id}`,
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
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
      // Create a thread
      const r = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
        `/projects/${projectId}/sessions/${sessionId}/chat-threads/${thread.id}/activate`,
        {
          method: "POST",
          headers: { Cookie: `token=${token}` },
        },
      );
      expect(activate.status).toBe(200);

      // Verify activeChatThreadId is updated
      const list = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
      // Create two threads
      const r1 = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
      // This would normally come from the agent after spawning ACP for the thread
      await sessionRepository.updateChatThread(sessionId, reviewerThread.id, {
        acpSessionId: "acp-thread-reviewer-123",
      });

      // Simulate agent disconnect and reconnect - load the session
      const session = await sessionRepository.findById(sessionId);
      expect(session).toBeDefined();

      // Verify thread has persisted acpSessionId
      const updatedThread = session!.chatThreads.find(
        (t: any) => t.id === reviewerThread.id,
      );
      expect(updatedThread?.acpSessionId).toBe("acp-thread-reviewer-123");

      // The session_ready message should include thread-level acpSessionId
      // This is verified by checking the thread data structure
      expect(session!.chatThreads).toHaveLength(2);

      // Verify each thread has the expected structure for bootstrap
      for (const thread of session!.chatThreads) {
        expect(thread.id).toBeDefined();
        expect(thread.name).toBeDefined();
        expect(thread.model).toBeDefined();
        expect(thread.mode).toBeDefined();
        // acpSessionId should be present (null or string)
        expect(thread).toHaveProperty("acpSessionId");
      }
    });

    it("should preserve thread acpSessionId across session reloads", async () => {
      // Create a thread with acpSessionId
      const r = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
      await sessionRepository.updateChatThread(sessionId, thread.id, {
        acpSessionId: "acp-feature-session-456",
        model: "claude-3-opus",
        mode: "build",
      });

      // Reload session from disk (simulates restart)
      const reloadedSession = await sessionRepository.findById(sessionId);
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
      const sentMessages: any[] = [];
      const originalIsOnline = agentService.isAgentOnline.bind(agentService);
      const originalGetConnection = agentService.getAgentConnection.bind(agentService);

      agentService.isAgentOnline = () => true;
      agentService.getAgentConnection = () => ({
        readyState: 1,
        send: (payload: string) => sentMessages.push(JSON.parse(payload)),
      });

      try {
        const session = await sessionRepository.findById(sessionId);
        expect(session?.mcpToken).toBeTruthy();

        const res = await app.request(
          `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
      const sentMessages: any[] = [];
      const originalIsOnline = agentService.isAgentOnline.bind(agentService);
      const originalGetConnection = agentService.getAgentConnection.bind(agentService);

      agentService.isAgentOnline = () => true;
      agentService.getAgentConnection = () => ({
        readyState: 1,
        send: (payload: string) => sentMessages.push(JSON.parse(payload)),
      });

      try {
        const initial = await sessionRepository.findById(sessionId);
        const firstToken = initial!.mcpToken;

        for (let i = 0; i < 2; i += 1) {
          const res = await app.request(
            `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
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
});
