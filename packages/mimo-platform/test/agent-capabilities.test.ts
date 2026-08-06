import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";

// Helper to create test app with internal API mounted
function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createAgentsRoutes,
  } = require("../src/web/features/agents/pages/agents.tsx");

  const app = new Hono();

  // Mount internal API
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

  // Mount agent routes with fetchFn that routes through app
  const agents = createAgentsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const path = new URL(urlStr).pathname;
        return app.request(path, init);
      }
      return fetch(url, init);
    },
  });
  app.route("/agents", agents);

  return app;
}

describe("Agent Capabilities", () => {
  let testHome: string;
  let agentRepository: any;
  let agentService: any;
  let userRepository: any;
  let projectRepository: any;
  let sessionRepository: any;
  let mimoContext: any;
  let authToken: string;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-agent-caps-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

    mimoContext = ctx;
    userRepository = ctx.repos.users;
    agentRepository = ctx.repos.agents;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;
    agentService = ctx.services.agents;

    await userRepository.create(
      "testuser",
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
    );
    authToken = await ctx.services.auth.generateToken("testuser");
  });

  describe("GET /agents/:agentId/capabilities", () => {
    it("returns 404 when agent does not exist", async () => {
      const app = createTestApp(mimoContext);

      const res = await app.request("/agents/nonexistent/capabilities", {
        headers: { Cookie: `token=${authToken}` },
      });

      expect(res.status).toBe(404);
    });

    it("returns 404 when agent has no cached capabilities", async () => {
      const app = createTestApp(mimoContext);

      const agent = await agentRepository.create({
        name: "No Caps Agent",
        owner: "testuser",
        provider: "opencode",
      });

      const res = await app.request(`/agents/${agent.id}/capabilities`, {
        headers: { Cookie: `token=${authToken}` },
      });

      expect(res.status).toBe(404);
    });

    it("returns capabilities after agent advertises them", async () => {
      const app = createTestApp(mimoContext);

      const agent = await agentRepository.create({
        name: "Caps Agent",
        owner: "testuser",
        provider: "opencode",
      });

      const capabilities = {
        availableModels: [
          { value: "sonnet", name: "Claude Sonnet" },
          { value: "opus", name: "Claude Opus" },
        ],
        defaultModelId: "sonnet",
        availableModes: [
          { value: "code", name: "Code" },
          { value: "ask", name: "Ask" },
        ],
        defaultModeId: "code",
      };

      await agentRepository.updateCapabilities(agent.id, capabilities);

      const res = await app.request(`/agents/${agent.id}/capabilities`, {
        headers: { Cookie: `token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.defaultModelId).toBe("sonnet");
      expect(body.defaultModeId).toBe("code");
      expect(body.availableModels).toHaveLength(2);
      expect(body.availableModes).toHaveLength(2);
    });

    it("derives capabilities from session state when cache is missing", async () => {
      const app = createTestApp(mimoContext);

      const agent = await agentRepository.create({
        name: "Derived Caps Agent",
        owner: "testuser",
        provider: "opencode",
      });

      const project = await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Caps Project",
        owner: "testuser",
      });

      const session = await sessionRepository.create({
        name: "Caps Session",
        projectId: project.id,
        owner: "testuser",
        assignedAgentId: agent.id,
      });

      await sessionRepository.update(session.id, {
        modelState: {
          currentModelId: "claude-sonnet",
          availableModels: [
            { value: "claude-sonnet", name: "Claude Sonnet" },
            { value: "claude-opus", name: "Claude Opus" },
          ],
          optionId: "model",
        },
        modeState: {
          currentModeId: "code",
          availableModes: [
            { value: "code", name: "Code" },
            { value: "ask", name: "Ask" },
          ],
          optionId: "mode",
        },
      });

      const res = await app.request(`/agents/${agent.id}/capabilities`, {
        headers: { Cookie: `token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.defaultModelId).toBe("claude-sonnet");
      expect(body.defaultModeId).toBe("code");
      expect(body.availableModels).toHaveLength(2);
      expect(body.availableModes).toHaveLength(2);
    });

    it("returns updated capabilities after re-advertisement", async () => {
      const app = createTestApp(mimoContext);

      const agent = await agentRepository.create({
        name: "Recaps Agent",
        owner: "testuser",
        provider: "opencode",
      });

      await agentRepository.updateCapabilities(agent.id, {
        availableModels: [{ value: "old-model", name: "Old" }],
        defaultModelId: "old-model",
        availableModes: [{ value: "old-mode", name: "Old Mode" }],
        defaultModeId: "old-mode",
      });

      await agentRepository.updateCapabilities(agent.id, {
        availableModels: [{ value: "new-model", name: "New" }],
        defaultModelId: "new-model",
        availableModes: [{ value: "new-mode", name: "New Mode" }],
        defaultModeId: "new-mode",
      });

      const res = await app.request(`/agents/${agent.id}/capabilities`, {
        headers: { Cookie: `token=${authToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.defaultModelId).toBe("new-model");
    });
  });
});
