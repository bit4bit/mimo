import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";
import bcrypt from "bcrypt";

describe("Agent Capabilities", () => {
  let testHome: string;
  let agentRepository: any;
  let agentService: any;
  let userRepository: any;
  let agentRoutes: any;
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
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    userRepository = ctx.repos.users;
    agentRepository = ctx.repos.agents;
    agentService = ctx.services.agents;

    const { createAgentsRoutes } = await import("../src/agents/routes.tsx");
    agentRoutes = createAgentsRoutes(ctx);

    await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
    authToken = await ctx.services.auth.generateToken("testuser");
  });

  describe("GET /agents/:agentId/capabilities", () => {
    it("returns 404 when agent does not exist", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

      const res = await app.request("/agents/nonexistent/capabilities", {
        headers: { Cookie: `token=${authToken}` },
      });

      expect(res.status).toBe(404);
    });

    it("returns 404 when agent has no cached capabilities", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

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
      const app = new Hono();
      app.route("/agents", agentRoutes);

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

    it("returns updated capabilities after re-advertisement", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

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
