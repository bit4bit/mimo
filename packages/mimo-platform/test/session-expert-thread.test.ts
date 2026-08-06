import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { dump } from "js-yaml";

import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

function seedAgent(
  home: string,
  id: string,
  owner: string,
  status = "offline",
) {
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
      status,
      provider: "opencode",
      startedAt: now,
      updatedAt: now,
      sharedWith: [],
    }),
    { encoding: "utf-8" },
  );
}

function seedAgentWithCaps(
  home: string,
  id: string,
  owner: string,
  status = "offline",
) {
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
      status,
      provider: "opencode",
      startedAt: now,
      updatedAt: now,
      sharedWith: [],
      capabilities: {
        availableModels: [{ value: "claude-4-opus", name: "Claude 4 Opus" }],
        defaultModelId: "claude-4-opus",
        availableModes: [{ value: "code", name: "Code" }],
        defaultModeId: "code",
      },
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

function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");

  const app = new Hono();

  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

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

describe("Session expert thread defaults", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-expert-thread-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  async function createUserProjectAndToken() {
    await userRepository.create(
      "owner",
      await Bun.password.hash("pass", { algorithm: "bcrypt", cost: 10 }),
    );
    const token = await authService.generateToken("owner");
    const project = await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

      name: "Test Project",
      owner: "owner",
    });
    return { project, token };
  }

  // ─── Domain: create() initializes activeExpertThreadId: null ───────────────
  describe("Domain: new session has no active expert thread", () => {
    it("create() initializes activeExpertThreadId to null", async () => {
      const { project } = await createUserProjectAndToken();
      const session = await sessionRepository.create({
        name: "S",
        projectId: project.id,
        owner: "owner",
      });
      expect(session.activeExpertThreadId).toBeNull();
    });

    it("a session loaded from disk has activeExpertThreadId: null when not set", async () => {
      const { project } = await createUserProjectAndToken();
      const session = await sessionRepository.create({
        name: "S",
        projectId: project.id,
        owner: "owner",
      });
      const reloaded = await sessionRepository.findById(session.id);
      expect(reloaded!.activeExpertThreadId).toBeNull();
    });
  });

  // ─── Domain: setActiveExpertThread persists the pointer ────────────────────
  describe("Domain: setActiveExpertThread", () => {
    it("persists the expert thread pointer across re-reads", async () => {
      const { project } = await createUserProjectAndToken();
      const session = await sessionRepository.create({
        name: "S",
        projectId: project.id,
        owner: "owner",
      });
      // Add a thread so we can point at it
      const thread = await sessionRepository.addChatThread(session.id, {
        name: "T",
        model: "m",
        mode: "code",
        assignedAgentId: "agent-xyz",
        state: "active",
        brainWash: false,
        acpSessionId: null,
      });
      await sessionRepository.setActiveExpertThread(session.id, thread.id);
      const reloaded = await sessionRepository.findById(session.id);
      expect(reloaded!.activeExpertThreadId).toBe(thread.id);
    });

    it("setActiveExpertThread and setActiveChatThread are independent", async () => {
      const { project } = await createUserProjectAndToken();
      const session = await sessionRepository.create({
        name: "S",
        projectId: project.id,
        owner: "owner",
      });
      const t1 = await sessionRepository.addChatThread(session.id, {
        name: "T1",
        model: "m",
        mode: "code",
        assignedAgentId: "a1",
        state: "active",
        brainWash: false,
        acpSessionId: null,
      });
      const t2 = await sessionRepository.addChatThread(session.id, {
        name: "T2",
        model: "m",
        mode: "code",
        assignedAgentId: "a2",
        state: "active",
        brainWash: false,
        acpSessionId: null,
      });
      await sessionRepository.setActiveChatThread(session.id, t1.id);
      await sessionRepository.setActiveExpertThread(session.id, t2.id);
      const reloaded = await sessionRepository.findById(session.id);
      expect(reloaded!.activeChatThreadId).toBe(t1.id);
      expect(reloaded!.activeExpertThreadId).toBe(t2.id);

      // Switching chat side does not affect expert side
      await sessionRepository.setActiveChatThread(session.id, t2.id);
      const after = await sessionRepository.findById(session.id);
      expect(after!.activeChatThreadId).toBe(t2.id);
      expect(after!.activeExpertThreadId).toBe(t2.id); // unchanged
    });

    it("setActiveExpertThread(null) clears the pointer", async () => {
      const { project } = await createUserProjectAndToken();
      const session = await sessionRepository.create({
        name: "S",
        projectId: project.id,
        owner: "owner",
      });
      const t = await sessionRepository.addChatThread(session.id, {
        name: "T",
        model: "m",
        mode: "code",
        assignedAgentId: "a",
        state: "active",
        brainWash: false,
        acpSessionId: null,
      });
      await sessionRepository.setActiveExpertThread(session.id, t.id);
      await sessionRepository.setActiveExpertThread(session.id, null);
      const reloaded = await sessionRepository.findById(session.id);
      expect(reloaded!.activeExpertThreadId).toBeNull();
    });
  });

  // ─── Domain: removeChatThread clears activeExpertThreadId when matched ─────
  describe("Domain: removeChatThread clears activeExpertThreadId", () => {
    it("removing the active expert thread clears the pointer", async () => {
      const { project } = await createUserProjectAndToken();
      const session = await sessionRepository.create({
        name: "S",
        projectId: project.id,
        owner: "owner",
      });
      const t = await sessionRepository.addChatThread(session.id, {
        name: "T",
        model: "m",
        mode: "code",
        assignedAgentId: "a",
        state: "active",
        brainWash: false,
        acpSessionId: null,
      });
      await sessionRepository.setActiveExpertThread(session.id, t.id);
      await sessionRepository.setActiveChatThread(session.id, t.id);
      await sessionRepository.removeChatThread(session.id, t.id);
      const reloaded = await sessionRepository.findById(session.id);
      expect(reloaded!.activeExpertThreadId).toBeNull();
      // activeChatThreadId fell back to null (no remaining threads)
      expect(reloaded!.activeChatThreadId).toBeNull();
    });

    it("removing a different thread does not affect activeExpertThreadId", async () => {
      const { project } = await createUserProjectAndToken();
      const session = await sessionRepository.create({
        name: "S",
        projectId: project.id,
        owner: "owner",
      });
      const keep = await sessionRepository.addChatThread(session.id, {
        name: "Keep",
        model: "m",
        mode: "code",
        assignedAgentId: "a",
        state: "active",
        brainWash: false,
        acpSessionId: null,
      });
      const drop = await sessionRepository.addChatThread(session.id, {
        name: "Drop",
        model: "m",
        mode: "code",
        assignedAgentId: "a",
        state: "active",
        brainWash: false,
        acpSessionId: null,
      });
      await sessionRepository.setActiveExpertThread(session.id, keep.id);
      await sessionRepository.removeChatThread(session.id, drop.id);
      const reloaded = await sessionRepository.findById(session.id);
      expect(reloaded!.activeExpertThreadId).toBe(keep.id);
    });
  });

  // ─── API: POST /sessions with expert fields ───────────────────────────────
  describe("API: POST /sessions with expert defaults", () => {
    async function postSessions(
      app: Hono,
      token: string,
      body: Record<string, unknown>,
    ) {
      return app.request("/api/internal/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    }

    it("creates the Expert thread and sets activeExpertThreadId when agent is online", async () => {
      const { project, token } = await createUserProjectAndToken();
      seedAgentWithCaps(testHome, "agent-expert", "owner", "online");
      // Make the agent "online" from the service's perspective
      agentService.isAgentOnline = () => true;

      const app = createTestApp(mimoContext);

      const res = await postSessions(app, token, {
        name: "S",
        projectId: project.id,
        expertAgentId: "agent-expert",
        expertModelId: "claude-4-opus",
        expertModeId: "code",
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      const sessionId = body.data.session.id;
      expect(body.data.session.activeExpertThreadId).toBeDefined();
      const expertId = body.data.session.activeExpertThreadId;
      const expertThread = body.data.session.chatThreads.find(
        (t: any) => t.id === expertId,
      );
      expect(expertThread).toBeDefined();
      expect(expertThread.name).toBe("Expert");
      expect(expertThread.assignedAgentId).toBe("agent-expert");
      expect(expertThread.model).toBe("claude-4-opus");
      expect(expertThread.mode).toBe("code");

      // Persisted
      const reloaded = await sessionRepository.findById(sessionId);
      expect(reloaded!.activeExpertThreadId).toBe(expertId);
    });

    it("succeeds with activeExpertThreadId: null when agent is offline", async () => {
      const { project, token } = await createUserProjectAndToken();
      seedAgent(testHome, "agent-offline", "owner", "offline");
      agentService.isAgentOnline = () => false;

      const app = createTestApp(mimoContext);

      const res = await postSessions(app, token, {
        name: "S",
        projectId: project.id,
        expertAgentId: "agent-offline",
        expertModelId: "claude-4-opus",
        expertModeId: "code",
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.session.activeExpertThreadId).toBeNull();
      expect(body.data.session.chatThreads).toHaveLength(0);
    });

    it("succeeds silently if the auto-create throws (e.g., name collision)", async () => {
      const { project, token } = await createUserProjectAndToken();
      seedAgentWithCaps(testHome, "agent-e", "owner", "online");
      agentService.isAgentOnline = () => true;

      // Force addChatThread to throw on the new session to simulate any
      // auto-create failure (e.g., a name collision in a race).
      const realAdd = sessionRepository.addChatThread.bind(sessionRepository);
      sessionRepository.addChatThread = async (sessionId: string, t: any) => {
        const s = await sessionRepository.findById(sessionId);
        if (s && s.name === "New" && t.name === "Expert") {
          throw new Error(
            "A thread with name 'Expert' already exists in this session",
          );
        }
        return realAdd(sessionId, t);
      };

      const app = createTestApp(mimoContext);
      const res = await postSessions(app, token, {
        name: "New",
        projectId: project.id,
        expertAgentId: "agent-e",
        expertModelId: "m",
        expertModeId: "code",
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.session.activeExpertThreadId).toBeNull();
      // The new session has no threads (the auto-create was swallowed)
      expect(body.data.session.chatThreads).toHaveLength(0);

      sessionRepository.addChatThread = realAdd;
    });

    it("succeeds with activeExpertThreadId: null when no expert fields are provided", async () => {
      const { project, token } = await createUserProjectAndToken();
      const app = createTestApp(mimoContext);

      const res = await postSessions(app, token, {
        name: "Plain",
        projectId: project.id,
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.session.activeExpertThreadId).toBeNull();
      expect(body.data.session.chatThreads).toHaveLength(0);
    });
  });

  // ─── API: setActiveExpertThread endpoint ──────────────────────────────────
  describe("API: POST /sessions/:id/active-expert-thread", () => {
    it("sets the active expert thread pointer", async () => {
      const { project, token } = await createUserProjectAndToken();
      const session = await sessionRepository.create({
        name: "S",
        projectId: project.id,
        owner: "owner",
      });
      const chatThread = await sessionRepository.addChatThread(session.id, {
        name: "Chat",
        model: "m",
        mode: "code",
        assignedAgentId: "a",
        state: "active",
        brainWash: false,
        acpSessionId: null,
      });
      const expertThread = await sessionRepository.addChatThread(session.id, {
        name: "Expert",
        model: "m",
        mode: "code",
        assignedAgentId: "a",
        state: "active",
        brainWash: false,
        acpSessionId: null,
      });
      // chat side defaults to the first thread
      await sessionRepository.setActiveChatThread(session.id, chatThread.id);
      const app = createTestApp(mimoContext);

      const res = await app.request(
        `/api/internal/sessions/${session.id}/active-expert-thread`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ threadId: expertThread.id }),
        },
      );
      expect(res.status).toBe(200);
      const reloaded = await sessionRepository.findById(session.id);
      expect(reloaded!.activeExpertThreadId).toBe(expertThread.id);
      // chat side unaffected
      expect(reloaded!.activeChatThreadId).toBe(chatThread.id);
    });

    it("rejects an unknown threadId", async () => {
      const { project, token } = await createUserProjectAndToken();
      const session = await sessionRepository.create({
        name: "S",
        projectId: project.id,
        owner: "owner",
      });
      const app = createTestApp(mimoContext);

      const res = await app.request(
        `/api/internal/sessions/${session.id}/active-expert-thread`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ threadId: "nope" }),
        },
      );
      expect(res.status).toBe(400);
    });
  });

  // ─── UI: SessionCreatePage renders expert-mode fields ─────────────────────
  describe("UI: SessionCreatePage", () => {
    it("renders the optional expert-mode agent + model selects on /sessions/new", async () => {
      const { project, token } = await createUserProjectAndToken();
      const app = createTestApp(mimoContext);

      const res = await app.request(`/projects/${project.id}/sessions/new`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('name="expertAgentId"');
      expect(html).toContain('name="expertModelId"');
      expect(html).toContain("Expert Mode");
    });

    it("POST /sessions forwards expertAgentId and expertModelId to the internal API", async () => {
      const { project, token } = await createUserProjectAndToken();
      seedAgentWithCaps(testHome, "agent-x", "owner", "online");
      agentService.isAgentOnline = () => true;
      const app = createTestApp(mimoContext);

      const form = new URLSearchParams();
      form.append("name", "Expert Session");
      form.append("expertAgentId", "agent-x");
      form.append("expertModelId", "claude-4-opus");

      const res = await app.request(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: form.toString(),
      });

      // The POST redirects (302) on success
      expect(res.status).toBe(302);
      const location = res.headers.get("location") || "";
      const sessionId = location.split("/").pop();
      expect(sessionId).toBeDefined();
      const reloaded = await sessionRepository.findById(sessionId!);
      expect(reloaded).not.toBeNull();
      // Agent was "online" so the Expert thread should have been auto-created
      expect(reloaded!.activeExpertThreadId).not.toBeNull();
      const expert = reloaded!.chatThreads.find(
        (t: any) => t.id === reloaded!.activeExpertThreadId,
      );
      expect(expert).toBeDefined();
      expect(expert.name).toBe("Expert");
      expect(expert.assignedAgentId).toBe("agent-x");
      expect(expert.model).toBe("claude-4-opus");
    });
  });
});
