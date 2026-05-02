/**
 * Integration tests for the dashboard internal API.
 *
 * These tests verify that the dashboard internal API endpoint:
 * - Requires authentication
 * - Returns aggregated dashboard data (projects, agents, sessions)
 * - Returns correct stats calculated from the data
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "../index.js";
import { createMimoContext } from "../../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { DashboardResponse } from "./types.js";

describe("Dashboard Internal API", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let mockOS: MockOS;
  let validToken: string;
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    // Set up mock OS with test environment
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-for-dashboard-api-tests",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-dashboard",
        MIMO_SHARED_FOSSIL_SERVER_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    // Create mock filesystem structure
    mockOS.fs.seed({
      "/tmp/test-mimo-dashboard": null,
      "/tmp/test-mimo-dashboard/users": null,
      "/tmp/test-mimo-dashboard/projects": null,
      "/tmp/test-mimo-dashboard/agents": null,
      "/tmp/test-mimo-dashboard/mcp-servers": null,
      "/tmp/test-mimo-dashboard/session-fossils": null,
    });

    // Create MimoContext with mock OS
    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-dashboard-api-tests",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo-dashboard",
        FOSSIL_REPOS_DIR: "/tmp/test-mimo-dashboard/session-fossils",
        MIMO_SHARED_FOSSIL_SERVER_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    // Generate tokens for testing
    user1Token = await mimoContext.services.auth.generateToken("user1");
    user2Token = await mimoContext.services.auth.generateToken("user2");
    validToken = user1Token;

    // Create app with internal API router mounted
    app = new Hono();
    app.route("/api/internal", createInternalApiRouter(mimoContext));
  });

  describe("GET /api/internal/dashboard", () => {
    it("should require authentication", async () => {
      const req = new Request("http://localhost:3000/api/internal/dashboard");
      const res = await app.fetch(req);
      const json = (await res.json()) as { success: boolean; error: string };

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Missing Authorization header");
    });

    it("should return empty dashboard data when user has no data", async () => {
      const req = new Request("http://localhost:3000/api/internal/dashboard", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      const res = await app.fetch(req);
      const json = (await res.json()) as {
        success: boolean;
        data: DashboardResponse;
      };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("projects");
      expect(json.data).toHaveProperty("agents");
      expect(json.data).toHaveProperty("recentSessions");
      expect(json.data).toHaveProperty("stats");
      expect(json.data.projects).toEqual([]);
      expect(json.data.agents).toEqual([]);
      expect(json.data.recentSessions).toEqual([]);
      expect(json.data.stats).toEqual({
        totalProjects: 0,
        totalAgents: 0,
        onlineAgents: 0,
        offlineAgents: 0,
        activeSessions: 0,
      });
    });

    it("should return only user's projects", async () => {
      // Create a project for user1
      await mimoContext.repos.projects.create({
        name: "User1 Project",
        repoUrl: "https://github.com/user1/project",
        repoType: "git",
        owner: "user1",
      });

      // Create a project for user2
      await mimoContext.repos.projects.create({
        name: "User2 Project",
        repoUrl: "https://github.com/user2/project",
        repoType: "git",
        owner: "user2",
      });

      const req = new Request("http://localhost:3000/api/internal/dashboard", {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
      });

      const res = await app.fetch(req);
      const json = (await res.json()) as {
        success: boolean;
        data: DashboardResponse;
      };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.projects.length).toBe(1);
      expect(json.data.projects[0].name).toBe("User1 Project");
      expect(json.data.projects[0].owner).toBe("user1");
    });

    it("should return only user's agents", async () => {
      // Create an agent for user1
      await mimoContext.services.agents.createAgent({
        name: "User1 Agent",
        owner: "user1",
        provider: "opencode",
      });

      // Create an agent for user2
      await mimoContext.services.agents.createAgent({
        name: "User2 Agent",
        owner: "user2",
        provider: "opencode",
      });

      const req = new Request("http://localhost:3000/api/internal/dashboard", {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
      });

      const res = await app.fetch(req);
      const json = (await res.json()) as {
        success: boolean;
        data: DashboardResponse;
      };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.agents.length).toBe(1);
      expect(json.data.agents[0].name).toBe("User1 Agent");
    });

    it("should calculate stats correctly", async () => {
      // Get current counts before adding new data
      const baseRes = await app.fetch(
        new Request("http://localhost:3000/api/internal/dashboard", {
          headers: {
            Authorization: `Bearer ${user1Token}`,
          },
        }),
      );
      const baseJson = (await baseRes.json()) as {
        success: boolean;
        data: DashboardResponse;
      };
      const baseStats = baseJson.data.stats;

      // Create an online agent for user1
      const agent = await mimoContext.services.agents.createAgent({
        name: "Stats Test Online Agent",
        owner: "user1",
        provider: "opencode",
      });
      // Mark agent as online
      await mimoContext.repos.agents.update(agent.id, { status: "online" });

      // Create an offline agent for user1
      const agent2 = await mimoContext.services.agents.createAgent({
        name: "Stats Test Offline Agent",
        owner: "user1",
        provider: "opencode",
      });
      // Mark agent as offline
      await mimoContext.repos.agents.update(agent2.id, { status: "offline" });

      // Create a project with an active session
      const project = await mimoContext.repos.projects.create({
        name: "Stats Test Project",
        repoUrl: "https://github.com/user1/stats-project",
        repoType: "git",
        owner: "user1",
      });

      await mimoContext.repos.sessions.create({
        name: "Stats Test Session",
        projectId: project.id,
        owner: "user1",
      });

      const req = new Request("http://localhost:3000/api/internal/dashboard", {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
      });

      const res = await app.fetch(req);
      const json = (await res.json()) as {
        success: boolean;
        data: DashboardResponse;
      };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      // Verify stats reflect the added data
      expect(json.data.stats.totalProjects).toBe(baseStats.totalProjects + 1);
      expect(json.data.stats.totalAgents).toBe(baseStats.totalAgents + 2);
      expect(json.data.stats.onlineAgents).toBe(baseStats.onlineAgents + 1);
      expect(json.data.stats.offlineAgents).toBe(baseStats.offlineAgents + 1);
      expect(json.data.stats.activeSessions).toBe(baseStats.activeSessions + 1);
    });

    it("should return sessions sorted by creation date descending", async () => {
      // Create a project for sessions
      const project = await mimoContext.repos.projects.create({
        name: "Session Sort Project",
        repoUrl: "https://github.com/user1/sort-project",
        repoType: "git",
        owner: "user1",
      });

      // Create sessions with different timestamps
      const session1 = await mimoContext.repos.sessions.create({
        name: "Older Session",
        projectId: project.id,
        owner: "user1",
      });

      // Wait a tiny bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const session2 = await mimoContext.repos.sessions.create({
        name: "Newer Session",
        projectId: project.id,
        owner: "user1",
      });

      const req = new Request("http://localhost:3000/api/internal/dashboard", {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
      });

      const res = await app.fetch(req);
      const json = (await res.json()) as {
        success: boolean;
        data: DashboardResponse;
      };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      // Sessions should be sorted by creation date descending (newest first)
      expect(json.data.recentSessions.length).toBeGreaterThanOrEqual(2);
      const sessionNames = json.data.recentSessions.map((s) => s.name);
      expect(sessionNames.indexOf("Newer Session")).toBeLessThan(
        sessionNames.indexOf("Older Session"),
      );
    });

    it("should only return user's sessions", async () => {
      // Create a project for user2
      const user2Project = await mimoContext.repos.projects.create({
        name: "User2 Session Project",
        repoUrl: "https://github.com/user2/session-project",
        repoType: "git",
        owner: "user2",
      });

      // Create a session in user2's project
      await mimoContext.repos.sessions.create({
        name: "User2 Session",
        projectId: user2Project.id,
        owner: "user2",
      });

      const req = new Request("http://localhost:3000/api/internal/dashboard", {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
      });

      const res = await app.fetch(req);
      const json = (await res.json()) as {
        success: boolean;
        data: DashboardResponse;
      };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      // Should not include user2's session
      const sessionNames = json.data.recentSessions.map((s) => s.name);
      expect(sessionNames).not.toContain("User2 Session");
    });
  });
});
