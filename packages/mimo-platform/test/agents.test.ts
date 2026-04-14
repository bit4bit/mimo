import { describe, it, expect, beforeEach } from "bun:test";
import { setMimoHome, clearConfig } from "../src/config/global-config.js";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import bcrypt from "bcrypt";

let agentRoutes: any;
let agentRepository: any;
let agentService: any;
let userRepository: any;
let sessionRepository: any;

describe("Agent Lifecycle Integration Tests", () => {
  const testHome = join(tmpdir(), `mimo-agent-test-${Date.now()}`);

  beforeEach(async () => {
    setMimoHome(testHome);
    process.env.JWT_SECRET = "test-secret-key-for-testing";

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    const pathsModule = await import("../src/config/paths.ts");
    pathsModule.ensureMimoHome();

    const userModule = await import("../src/auth/user.ts");
    userRepository = userModule.userRepository;

    const sessionModule = await import("../src/sessions/repository.ts");
    sessionRepository = sessionModule.sessionRepository;

    const agentRepoModule = await import("../src/agents/repository.ts");
    agentRepository = agentRepoModule.agentRepository;

    const agentSvcModule = await import("../src/agents/service.ts");
    agentService = agentSvcModule.agentService;

    const routesModule = await import("../src/agents/routes.tsx");
    agentRoutes = routesModule.default;
  });

  describe("Agent Creation", () => {
    it("should create agent record with JWT token", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const agent = await agentService.createAgent({
        name: "Test Agent",
        owner: "testuser",
        provider: "opencode",
      });

      expect(agent).toBeDefined();
      expect(agent.name).toBe("Test Agent");
      expect(agent.owner).toBe("testuser");
      expect(agent.provider).toBe("opencode");
      expect(agent.token).toBeDefined();
      expect(agent.status).toBe("offline");
    });

    it("should reject agent creation without provider", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      expect(async () => {
        await agentService.createAgent({
          name: "No Provider Agent",
          owner: "testuser",
          // @ts-ignore - intentionally testing without provider
          provider: undefined,
        });
      }).toThrow("Provider is required");
    });

    it("should reject empty name", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      expect(async () => {
        await agentService.createAgent({
          name: "",
          owner: "testuser",
          provider: "opencode",
        });
      }).toThrow("Name is required");
    });

    it("should reject whitespace-only name", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      expect(async () => {
        await agentService.createAgent({
          name: "   ",
          owner: "testuser",
          provider: "opencode",
        });
      }).toThrow("Name is required");
    });

    it("should reject name longer than 64 characters", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      expect(async () => {
        await agentService.createAgent({
          name: "a".repeat(65),
          owner: "testuser",
          provider: "opencode",
        });
      }).toThrow("Name must be 64 characters or less");
    });

    it("should verify agent JWT token includes provider", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const agent = await agentRepository.create({
        name: "JWT Test Agent",
        owner: "testuser",
        provider: "claude",
      });

      const token = await agentService.generateAgentToken(agent);
      const payload = await agentService.verifyAgentToken(token);

      expect(payload).toBeDefined();
      expect(payload?.agentId).toBe(agent.id);
      expect(payload?.owner).toBe("testuser");
      expect(payload?.provider).toBe("claude");
    });

    it("should verify agent JWT token", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const agent = await agentRepository.create({
        name: "JWT Test Agent",
        owner: "testuser",
        provider: "opencode",
      });

      const token = await agentService.generateAgentToken(agent);
      const payload = await agentService.verifyAgentToken(token);

      expect(payload).toBeDefined();
      expect(payload?.agentId).toBe(agent.id);
      expect(payload?.owner).toBe("testuser");
    });

    it("should reject invalid agent token", async () => {
      const payload = await agentService.verifyAgentToken("invalid-token");
      expect(payload).toBeNull();
    });
  });

  describe("Agent Status Tracking", () => {
    it("should update agent status to online on connect", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const agent = await agentRepository.create({
        name: "Online Test Agent",
        owner: "testuser",
        provider: "opencode",
      });

      await agentRepository.updateStatus(agent.id, "online");
      const updated = await agentRepository.findById(agent.id);
      expect(updated?.status).toBe("online");
    });

    it("should update agent status to offline on disconnect", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const agent = await agentRepository.create({
        name: "Offline Test Agent",
        owner: "testuser",
        provider: "opencode",
      });

      await agentRepository.updateStatus(agent.id, "online");
      await agentRepository.updateStatus(agent.id, "offline");
      
      const updated = await agentRepository.findById(agent.id);
      expect(updated?.status).toBe("offline");
    });

    it("should list agents by owner", async () => {
      await userRepository.create("user1", await bcrypt.hash("pass1", 10));
      await userRepository.create("user2", await bcrypt.hash("pass2", 10));

      await agentRepository.create({ name: "User1 Agent", owner: "user1", provider: "opencode" });
      await agentRepository.create({ name: "User2 Agent", owner: "user2", provider: "claude" });

      const user1Agents = await agentRepository.findByOwner("user1");
      expect(user1Agents.length).toBe(1);
      expect(user1Agents[0].owner).toBe("user1");
    });

    it("should list agents by status", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      await agentRepository.create({ name: "Offline Agent", owner: "testuser", provider: "opencode" });
      const agent2 = await agentRepository.create({ name: "Online Agent", owner: "testuser", provider: "claude" });
      await agentRepository.updateStatus(agent2.id, "online");

      const onlineAgents = await agentRepository.findByStatus("online");
      expect(onlineAgents.length).toBe(1);
      expect(onlineAgents[0].id).toBe(agent2.id);
    });

    it("should delete agent", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const agent = await agentRepository.create({
        name: "Delete Test Agent",
        owner: "testuser",
        provider: "opencode",
      });

      expect(await agentRepository.exists(agent.id)).toBe(true);

      await agentRepository.delete(agent.id);

      expect(await agentRepository.exists(agent.id)).toBe(false);
    });
  });

  describe("Agent Listing Page", () => {
    it("should show agents list page", async () => {
      const app = new Hono();
      app.route("/agents", agentRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const agent = await agentRepository.create({ name: "List Page Agent", owner: "testuser", provider: "opencode" });
      const token = await agentService.generateAgentToken(agent);
      await agentRepository.update(agent.id, { token });

      const { generateToken } = await import("../src/auth/jwt.ts");
      const token2 = await generateToken("testuser");

      const res = await app.request("/agents", {
        headers: { Cookie: `token=${token2}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Agents");
    });
  });
});