// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tests for the project features web JSON routes.
 *
 * These mirror the `/projects/:id/notes` JSON endpoints: the web routes
 * proxy to the internal API via the internal API client and return JSON.
 * They back the `features.js` browser script for add/edit/delete/done.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

let mimoContext: any;
let app: Hono;
let user1Token: string;
let testProjectId: string;

function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createProjectsRoutes,
  } = require("../src/web/features/projects/pages/projects.tsx");

  const router = new Hono();
  const internalRouter = createInternalApiRouter(ctx);
  router.route("/api/internal", internalRouter);

  const projects = createProjectsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const parsed = new URL(urlStr);
        return router.request(parsed.pathname + parsed.search, init);
      }
      return fetch(url, init);
    },
  });
  router.route("/projects", projects);

  return router;
}

describe("Project Features Web Routes", () => {
  beforeAll(async () => {
    const testHome = join(
      tmpdir(),
      `mimo-features-web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    mimoContext = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-features-web" },
      services: { sharedVcs: new DummyGitHttpServer() },
    });

    user1Token = await mimoContext.services.auth.generateToken("user1");

    const project = await mimoContext.repos.projects.create({
      name: "Features Web Project",
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/test/features-web",
          repoType: "git",
          mountPath: ".",
        },
      ],
      owner: "user1",
    });
    testProjectId = project.id;

    app = createTestApp(mimoContext);
  });

  function authed(url: string, init: RequestInit = {}): Request {
    return new Request(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Cookie: `token=${user1Token}`,
      },
    });
  }

  describe("GET /projects/:id/features", () => {
    it("returns an empty list when no features exist", async () => {
      const res = await app.fetch(
        authed(`http://localhost/projects/${testProjectId}/features`),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.features).toEqual([]);
    });

    it("returns features after they are created", async () => {
      // Create a feature directly via the repo.
      await mimoContext.repos.features.add(testProjectId, {
        branchName: "web-feat",
        description: "web desc",
      });

      const res = await app.fetch(
        authed(`http://localhost/projects/${testProjectId}/features`),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.features).toHaveLength(1);
      expect(json.features[0].branchName).toBe("web-feat");
      expect(json.features[0].description).toBe("web desc");
      expect(json.features[0].done).toBe(false);
    });
  });

  describe("POST /projects/:id/features", () => {
    it("creates a feature and returns it as JSON", async () => {
      const res = await app.fetch(
        authed(`http://localhost/projects/${testProjectId}/features`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchName: "post-feat",
            description: "post desc",
          }),
        }),
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.feature.branchName).toBe("post-feat");
      expect(json.feature.description).toBe("post desc");
      expect(json.feature.done).toBe(false);
      expect(json.feature.id).toBeDefined();
    });

    it("rejects when branchName or description is missing", async () => {
      const res = await app.fetch(
        authed(`http://localhost/projects/${testProjectId}/features`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchName: "only-branch" }),
        }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });
  });

  describe("PUT /projects/:id/features/:featureId", () => {
    it("updates branchName and description", async () => {
      const created = await mimoContext.repos.features.add(testProjectId, {
        branchName: "put-old",
        description: "put old desc",
      });
      const res = await app.fetch(
        authed(
          `http://localhost/projects/${testProjectId}/features/${created.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              branchName: "put-new",
              description: "put new desc",
            }),
          },
        ),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.feature.branchName).toBe("put-new");
      expect(json.feature.description).toBe("put new desc");
    });

    it("toggles done via the done field", async () => {
      const created = await mimoContext.repos.features.add(testProjectId, {
        branchName: "toggle",
        description: "toggle desc",
      });
      const res = await app.fetch(
        authed(
          `http://localhost/projects/${testProjectId}/features/${created.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ done: true }),
          },
        ),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.feature.done).toBe(true);
    });
  });

  describe("DELETE /projects/:id/features/:featureId", () => {
    it("deletes a feature", async () => {
      const created = await mimoContext.repos.features.add(testProjectId, {
        branchName: "del",
        description: "del desc",
      });
      const res = await app.fetch(
        authed(
          `http://localhost/projects/${testProjectId}/features/${created.id}`,
          { method: "DELETE" },
        ),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const listRes = await app.fetch(
        authed(`http://localhost/projects/${testProjectId}/features`),
      );
      const listJson = await listRes.json();
      expect(
        listJson.features.find((f: any) => f.id === created.id),
      ).toBeUndefined();
    });
  });

  describe("Features tab 'Create session' link", () => {
    it("prefills the session name with the feature's branchName", async () => {
      await mimoContext.repos.features.add(testProjectId, {
        branchName: "dark-mode",
        description: "Add dark mode toggle",
      });

      const res = await app.fetch(
        authed(
          `http://localhost/projects?selected=${testProjectId}&tab=features`,
        ),
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      // The "Create session" link carries the branchName as the session name
      // prefill so the user does not have to retype it.
      expect(html).toContain("name=dark-mode");
      expect(html).toContain("branchName=dark-mode");
    });
  });
});
