// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for the sessions internal API.
 *
 * These tests verify that the sessions internal API endpoints:
 * - Require authentication
 * - Return standardized JSON responses
 * - Perform CRUD operations correctly
 * - Enforce ownership and authorization
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "../index.js";
import { createMimoContext } from "../../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../../infrastructure/os/mock-adapter.js";

describe("Sessions Internal API", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let mockOS: MockOS;
  let validToken: string;
  let user1Token: string;
  let user2Token: string;
  let testProjectId: string;

  beforeAll(async () => {
    // Set up mock OS with test environment
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-for-sessions-api-tests",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-sessions",
        MIMO_INTERNAL_VCS_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    // Create mock filesystem structure
    mockOS.fs.seed({
      "/tmp/test-mimo-sessions": null,
      "/tmp/test-mimo-sessions/users": null,
      "/tmp/test-mimo-sessions/projects": null,
      "/tmp/test-mimo-sessions/agents": null,
      "/tmp/test-mimo-sessions/mcp-servers": null,
      "/tmp/test-mimo-sessions/session-repos": null,
    });

    // Create MimoContext with mock OS
    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-sessions-api-tests",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo-sessions",
        MIMO_VCS_REPOS_DIR: "/tmp/test-mimo-sessions/session-repos",
        MIMO_INTERNAL_VCS_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    // Generate tokens for testing
    user1Token = await mimoContext.services.auth.generateToken("user1");
    user2Token = await mimoContext.services.auth.generateToken("user2");
    validToken = user1Token;

    // Create a test project for session creation
    const project = await mimoContext.repos.projects.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/test/project", repoType: "git", mountPath: "." }],

      name: "Test Project",
      owner: "user1",
    });
    testProjectId = project.id;

    // Create app with internal API router mounted
    app = new Hono();
    app.route("/api/internal", createInternalApiRouter(mimoContext));
  });

  describe("List Sessions", () => {
    it("should require authentication", async () => {
      const req = new Request("http://localhost:3000/api/internal/sessions");
      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Missing Authorization header");
    });

    it("should return empty list when no sessions exist", async () => {
      const req = new Request("http://localhost:3000/api/internal/sessions", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.sessions).toEqual([]);
    });

    it("should return only sessions owned by the user", async () => {
      // Create a session for user1
      await mimoContext.repos.sessions.create({
        name: "User1 Session",
        projectId: testProjectId,
        owner: "user1",
      });

      // Create a project and session for user2
      const user2Project = await mimoContext.repos.projects.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user2/project", repoType: "git", mountPath: "." }],

        name: "User2 Project",
        owner: "user2",
      });

      await mimoContext.repos.sessions.create({
        name: "User2 Session",
        projectId: user2Project.id,
        owner: "user2",
      });

      const req = new Request("http://localhost:3000/api/internal/sessions", {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.sessions.length).toBe(1);
      expect(json.data.sessions[0].name).toBe("User1 Session");
      expect(json.data.sessions[0].owner).toBe("user1");
    });
  });

  describe("Get Session", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/some-id",
      );
      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 404 for non-existent session", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/non-existent-id",
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Session not found");
    });

    it("should return 404 for session owned by different user", async () => {
      const user2Project = await mimoContext.repos.projects.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user2/project2", repoType: "git", mountPath: "." }],

        name: "User2 Project 2",
        owner: "user2",
      });

      const session = await mimoContext.repos.sessions.create({
        name: "User2 Session",
        projectId: user2Project.id,
        owner: "user2",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}`,
        {
          headers: {
            Authorization: `Bearer ${user1Token}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Session not found");
    });

    it("should return session with correct structure", async () => {
      const session = await mimoContext.repos.sessions.create({
        name: "Test Session",
        projectId: testProjectId,
        owner: "user1",
        priority: "high",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}`,
        {
          headers: {
            Authorization: `Bearer ${user1Token}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.session.id).toBe(session.id);
      expect(json.data.session.name).toBe("Test Session");
      expect(json.data.session.projectId).toBe(testProjectId);
      expect(json.data.session.owner).toBe("user1");
      expect(json.data.session.priority).toBe("high");
      expect(json.data.session.status).toBe("active");
      expect(json.data.session.createdAt).toBeDefined();
      expect(json.data.session.updatedAt).toBeDefined();
    });
  });

  describe("Create Session", () => {
    it("should require authentication", async () => {
      const req = new Request("http://localhost:3000/api/internal/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Session",
          projectId: testProjectId,
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should validate required fields", async () => {
      const req = new Request("http://localhost:3000/api/internal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: "Missing name and projectId",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Name and project ID are required");
    });

    it("should validate priority", async () => {
      const req = new Request("http://localhost:3000/api/internal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Session",
          projectId: testProjectId,
          priority: "invalid",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Priority must be one of: high, medium, low");
    });

    it("should validate sessionTtlDays", async () => {
      const req = new Request("http://localhost:3000/api/internal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Session",
          projectId: testProjectId,
          sessionTtlDays: 0,
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("sessionTtlDays must be an integer >= 1");
    });

    it("should return 404 for non-existent project", async () => {
      const req = new Request("http://localhost:3000/api/internal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Session",
          projectId: "non-existent-project-id",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Project not found");
    });

    it("should create session with minimum required fields", async () => {
      const req = new Request("http://localhost:3000/api/internal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Session",
          projectId: testProjectId,
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.session.name).toBe("Test Session");
      expect(json.data.session.projectId).toBe(testProjectId);
      expect(json.data.session.owner).toBe("user1");
      expect(json.data.session.priority).toBe("medium");
      expect(json.data.session.status).toBe("active");
    });

    it("should create session repository state for every project repository", async () => {
      const project = await mimoContext.repos.projects.create({
        name: "Multi Repo Session Project",
        repoUrl: "https://github.com/test/backend",
        repoType: "git",
        owner: "user1",
        repositories: [
          {
            id: "backend",
            name: "Backend",
            repoUrl: "https://github.com/test/backend",
            repoType: "git",
            mountPath: "backend",
            primary: true,
          },
          {
            id: "frontend",
            name: "Frontend",
            repoUrl: "https://github.com/test/frontend",
            repoType: "git",
            mountPath: "frontend",
          },
        ],
      });

      const req = new Request("http://localhost:3000/api/internal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Multi Repo Session",
          projectId: project.id,
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.session.repos).toHaveLength(2);
      expect(
        json.data.session.repos.map((repo: any) => repo.projectRepoId),
      ).toEqual(["backend", "frontend"]);
      expect(json.data.session.repos[0].upstreamPath).toContain("backend");
      expect(json.data.session.repos[1].workspacePath).toContain("frontend");
    });

    it("should create session with all optional fields", async () => {
      const agent = await mimoContext.repos.agents.create({
        name: "Test Agent",
        owner: "user1",
      });

      const req = new Request("http://localhost:3000/api/internal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Complete Session",
          projectId: testProjectId,
          assignedAgentId: agent.id,
          agentSubpath: "/src",
          branchName: "feature-branch",
          priority: "high",
          sessionTtlDays: 365,
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.session.name).toBe("Complete Session");
      expect(json.data.session.assignedAgentId).toBe(agent.id);
      expect(json.data.session.agentSubpath).toBe("/src");
      expect(json.data.session.priority).toBe("high");
      expect(json.data.session.sessionTtlDays).toBe(365);
    });
  });

  describe("Update Session", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/some-id",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 404 for non-existent session", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/non-existent-id",
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Updated" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Session not found");
    });

    it("should return 404 for session owned by different user", async () => {
      const user2Project = await mimoContext.repos.projects.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user2/project3", repoType: "git", mountPath: "." }],

        name: "User2 Project 3",
        owner: "user2",
      });

      const session = await mimoContext.repos.sessions.create({
        name: "User2 Session",
        projectId: user2Project.id,
        owner: "user2",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Hacked" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Session not found");
    });

    it("should validate priority", async () => {
      const session = await mimoContext.repos.sessions.create({
        name: "Update Test Session",
        projectId: testProjectId,
        owner: "user1",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ priority: "invalid" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Priority must be one of: high, medium, low");
    });

    it("should update session fields", async () => {
      const session = await mimoContext.repos.sessions.create({
        name: "Original Name",
        projectId: testProjectId,
        owner: "user1",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Updated Name",
            priority: "high",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.session.name).toBe("Updated Name");
      expect(json.data.session.priority).toBe("high");
    });
  });

  describe("Delete Session", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/some-id",
        {
          method: "DELETE",
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 404 for non-existent session", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/non-existent-id",
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it("should return 404 for session owned by different user", async () => {
      const user2Project = await mimoContext.repos.projects.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user2/project4", repoType: "git", mountPath: "." }],

        name: "User2 Project 4",
        owner: "user2",
      });

      const session = await mimoContext.repos.sessions.create({
        name: "User2 Session",
        projectId: user2Project.id,
        owner: "user2",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${user1Token}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });
  });

  describe("Close Session", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/some-id/close",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should close session with reason", async () => {
      const session = await mimoContext.repos.sessions.create({
        name: "Close Test Session",
        projectId: testProjectId,
        owner: "user1",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}/close`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            closeReason: "Completed successfully",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.session.status).toBe("closed");
      expect(json.data.session.closeReason).toBe("Completed successfully");
    });
  });

  describe("Assign Agent", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/some-id/assign-agent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agentId: "agent-id" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 404 for non-existent session", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/non-existent-id/assign-agent",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agentId: "agent-id" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Session not found");
    });

    it("should return 400 when agentId is missing", async () => {
      const session = await mimoContext.repos.sessions.create({
        name: "Assign Agent Test Session",
        projectId: testProjectId,
        owner: "user1",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}/assign-agent`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Agent ID is required");
    });

    it("should return 404 for non-existent agent", async () => {
      const session = await mimoContext.repos.sessions.create({
        name: "Assign Agent Test Session",
        projectId: testProjectId,
        owner: "user1",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}/assign-agent`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agentId: "non-existent-agent-id" }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Agent not found");
    });

    it("should assign agent to session", async () => {
      const agent = await mimoContext.repos.agents.create({
        name: "Test Agent",
        owner: "user1",
      });

      const session = await mimoContext.repos.sessions.create({
        name: "Assign Agent Test Session",
        projectId: testProjectId,
        owner: "user1",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}/assign-agent`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agentId: agent.id }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.session.assignedAgentId).toBe(agent.id);
    });
  });

  describe("Get Chat History", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/some-id/chat",
      );
      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 404 for non-existent session", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/sessions/non-existent-id/chat",
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Session not found");
    });

    it("should return empty chat history for new session", async () => {
      const session = await mimoContext.repos.sessions.create({
        name: "Chat History Test Session",
        projectId: testProjectId,
        owner: "user1",
      });

      const req = new Request(
        `http://localhost:3000/api/internal/sessions/${session.id}/chat`,
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.messages).toEqual([]);
    });
  });
});
