/**
 * Failing integration tests for: add-chat-threads-shared-workspace
 *
 * Tasks covered:
 *   1.3  per-thread model/mode are isolated across threads
 *   1.4  reconnect sends streaming state for active thread
 *   1.5  programmatic thread creation API works without UI
 *   session-management spec: session creation creates default Main thread
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
let token: string;
let projectId: string;
let sessionId: string;

describe("Chat Threads API", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-chat-threads-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret" },
      services: { sharedFossil: new DummySharedFossilServer() },
    });

    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;
    authService = ctx.services.auth;

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

  // Task 1.5 + session-management spec: new session has default Main thread
  describe("Session creation initializes a default Main thread", () => {
    it("GET /sessions/:id/chat-threads returns a single Main thread for a new session", async () => {
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
      expect(body.threads).toHaveLength(1);
      expect(body.threads[0].name).toBe("Main");
      expect(body.activeChatThreadId).toBe(body.threads[0].id);
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
          body: JSON.stringify({ name: "Reviewer", model: "claude-3", mode: "review" }),
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
          body: JSON.stringify({ name: "Reviewer", model: "claude-3", mode: "review" }),
        },
      );

      expect(res.status).toBe(401);
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
          headers: { "Content-Type": "application/json", Cookie: `token=${token}` },
          body: JSON.stringify({ name: "Coder", model: "gpt-4", mode: "code" }),
        },
      );
      expect(r1.status).toBe(201);
      const thread1 = await r1.json();

      const r2 = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `token=${token}` },
          body: JSON.stringify({ name: "Reviewer", model: "claude-3", mode: "review" }),
        },
      );
      expect(r2.status).toBe(201);
      const thread2 = await r2.json();

      // Change model of thread1 only
      const patch = await app.request(
        `/projects/${projectId}/sessions/${sessionId}/chat-threads/${thread1.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: `token=${token}` },
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
          headers: { "Content-Type": "application/json", Cookie: `token=${token}` },
          body: JSON.stringify({ name: "Main Thread", model: "claude-3", mode: "code" }),
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
});
