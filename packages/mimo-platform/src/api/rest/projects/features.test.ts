// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tests for the features internal API endpoints.
 *
 * These verify that the project feature sub-resource endpoints:
 * - Require authentication
 * - Return standardized JSON responses
 * - Perform CRUD operations correctly
 * - Enforce project ownership/authorization
 * - Do not validate branch names
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "../index.js";
import { createMimoContext } from "../../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../../infrastructure/os/mock-adapter.js";

describe("Features Internal API", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let mockOS: MockOS;
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-for-features-api-tests",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-features",
        MIMO_INTERNAL_VCS_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    mockOS.fs.seed({
      "/tmp/test-mimo-features": null,
      "/tmp/test-mimo-features/users": null,
      "/tmp/test-mimo-features/projects": null,
      "/tmp/test-mimo-features/agents": null,
      "/tmp/test-mimo-features/mcp-servers": null,
      "/tmp/test-mimo-features/session-repos": null,
    });

    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-features-api-tests",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo-features",
        MIMO_VCS_REPOS_DIR: "/tmp/test-mimo-features/session-repos",
        MIMO_INTERNAL_VCS_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    user1Token = await mimoContext.services.auth.generateToken("user1");
    user2Token = await mimoContext.services.auth.generateToken("user2");

    app = new Hono();
    app.route("/api/internal", createInternalApiRouter(mimoContext));
  });

  async function createProjectForUser1(): Promise<string> {
    const project = await mimoContext.repos.projects.create({
      name: "Feature Test Project",
      repoUrl: "https://github.com/test/features",
      repoType: "git",
      owner: "user1",
    });
    return project.id;
  }

  describe("List Features", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/projects/some-id/features",
      );
      const res = await app.fetch(req);
      const json = await res.json();
      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 404 for non-existent project", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/projects/non-existent-id/features",
        { headers: { Authorization: `Bearer ${user1Token}` } },
      );
      const res = await app.fetch(req);
      const json = await res.json();
      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Project not found");
    });

    it("should return 404 for project owned by a different user", async () => {
      const projectId = await createProjectForUser1();
      const req = new Request(
        `http://localhost:3000/api/internal/projects/${projectId}/features`,
        { headers: { Authorization: `Bearer ${user2Token}` } },
      );
      const res = await app.fetch(req);
      const json = await res.json();
      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it("should return an empty list when no features exist", async () => {
      const projectId = await createProjectForUser1();
      const req = new Request(
        `http://localhost:3000/api/internal/projects/${projectId}/features`,
        { headers: { Authorization: `Bearer ${user1Token}` } },
      );
      const res = await app.fetch(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.features).toEqual([]);
    });
  });

  describe("Create Feature", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/projects/some-id/features",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchName: "x", description: "y" }),
        },
      );
      const res = await app.fetch(req);
      expect(res.status).toBe(401);
    });

    it("should require branchName and description", async () => {
      const projectId = await createProjectForUser1();
      const req = new Request(
        `http://localhost:3000/api/internal/projects/${projectId}/features`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ branchName: "x" }),
        },
      );
      const res = await app.fetch(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("branchName and description are required");
    });

    it("should create a feature with done=false", async () => {
      const projectId = await createProjectForUser1();
      const req = new Request(
        `http://localhost:3000/api/internal/projects/${projectId}/features`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            branchName: "dark-mode",
            description: "Add dark mode toggle",
          }),
        },
      );
      const res = await app.fetch(req);
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.feature.branchName).toBe("dark-mode");
      expect(json.data.feature.description).toBe("Add dark mode toggle");
      expect(json.data.feature.done).toBe(false);
      expect(json.data.feature.id).toBeDefined();
      expect(json.data.feature.createdAt).toBeDefined();
    });

    it("should not validate branch names (stores verbatim)", async () => {
      const projectId = await createProjectForUser1();
      const req = new Request(
        `http://localhost:3000/api/internal/projects/${projectId}/features`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            branchName: "WEIRD branch name!",
            description: "anything",
          }),
        },
      );
      const res = await app.fetch(req);
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.data.feature.branchName).toBe("WEIRD branch name!");
    });

    it("should list a created feature", async () => {
      const projectId = await createProjectForUser1();
      await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/projects/${projectId}/features`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${user1Token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              branchName: "feat-a",
              description: "desc-a",
            }),
          },
        ),
      );
      const listRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/projects/${projectId}/features`,
          { headers: { Authorization: `Bearer ${user1Token}` } },
        ),
      );
      const listJson = await listRes.json();
      expect(listRes.status).toBe(200);
      expect(listJson.data.features).toHaveLength(1);
      expect(listJson.data.features[0].branchName).toBe("feat-a");
    });
  });

  describe("Update Feature", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/projects/some-id/features/fid",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchName: "x" }),
        },
      );
      const res = await app.fetch(req);
      expect(res.status).toBe(401);
    });

    it("should return 404 for non-existent project", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/projects/non-existent/features/fid",
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ branchName: "x" }),
        },
      );
      const res = await app.fetch(req);
      expect(res.status).toBe(404);
    });

    it("should return 404 for non-existent feature", async () => {
      const projectId = await createProjectForUser1();
      const req = new Request(
        `http://localhost:3000/api/internal/projects/${projectId}/features/no-such-id`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${user1Token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ branchName: "x", description: "y" }),
        },
      );
      const res = await app.fetch(req);
      const json = await res.json();
      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Feature not found");
    });

    it("should update branchName and description", async () => {
      const projectId = await createProjectForUser1();
      const createRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/projects/${projectId}/features`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${user1Token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              branchName: "old",
              description: "old desc",
            }),
          },
        ),
      );
      const createJson = await createRes.json();
      const featureId = createJson.data.feature.id;

      const updateRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/projects/${projectId}/features/${featureId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${user1Token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              branchName: "new",
              description: "new desc",
            }),
          },
        ),
      );
      const updateJson = await updateRes.json();
      expect(updateRes.status).toBe(200);
      expect(updateJson.data.feature.branchName).toBe("new");
      expect(updateJson.data.feature.description).toBe("new desc");
      // done preserved
      expect(updateJson.data.feature.done).toBe(false);
    });

    it("should toggle done via done field", async () => {
      const projectId = await createProjectForUser1();
      const createRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/projects/${projectId}/features`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${user1Token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              branchName: "feat",
              description: "desc",
            }),
          },
        ),
      );
      const createJson = await createRes.json();
      const featureId = createJson.data.feature.id;

      const toggleRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/projects/${projectId}/features/${featureId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${user1Token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ done: true }),
          },
        ),
      );
      const toggleJson = await toggleRes.json();
      expect(toggleRes.status).toBe(200);
      expect(toggleJson.data.feature.done).toBe(true);
    });
  });

  describe("Delete Feature", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/projects/some-id/features/fid",
        { method: "DELETE" },
      );
      const res = await app.fetch(req);
      expect(res.status).toBe(401);
    });

    it("should return 404 for non-existent project", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/projects/non-existent/features/fid",
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${user1Token}` },
        },
      );
      const res = await app.fetch(req);
      expect(res.status).toBe(404);
    });

    it("should delete a feature", async () => {
      const projectId = await createProjectForUser1();
      const createRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/projects/${projectId}/features`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${user1Token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              branchName: "to-delete",
              description: "bye",
            }),
          },
        ),
      );
      const createJson = await createRes.json();
      const featureId = createJson.data.feature.id;

      const delRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/projects/${projectId}/features/${featureId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${user1Token}` },
          },
        ),
      );
      const delJson = await delRes.json();
      expect(delRes.status).toBe(200);
      expect(delJson.success).toBe(true);

      const listRes = await app.fetch(
        new Request(
          `http://localhost:3000/api/internal/projects/${projectId}/features`,
          { headers: { Authorization: `Bearer ${user1Token}` } },
        ),
      );
      const listJson = await listRes.json();
      expect(listJson.data.features).toEqual([]);
    });
  });
});
