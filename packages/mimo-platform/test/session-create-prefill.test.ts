// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tests for session creation prefill via query params.
 *
 * - GET /projects/:projectId/sessions/new?branchName=...&notes=... renders
 *   the form with the branch name prefilled verbatim.
 * - POST /projects/:projectId/sessions with a `notes` form field writes the
 *   notes to the new session's notes.txt as plain text.
 * - Without query params, existing defaults are unchanged.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

let mimoContext: any;
let app: Hono;
let user1Token: string;
let testProjectId: string;
let testHome: string;

function stubVcs(ctx: any) {
  ctx.services.vcs.cloneRepository = async () => ({ success: true });
  ctx.services.vcs.importToFossil = async () => ({ success: true });
  ctx.services.vcs.seedSessionRepo = async () => ({ success: true });
  ctx.services.vcs.clonePlatformCheckout = async () => ({ success: true });
  ctx.services.vcs.syncIgnoresToGit = async () => ({ success: true });
  ctx.services.vcs.getCurrentBranch = async () => ({
    success: true,
    branch: "main",
  });
  ctx.services.vcs.createBranch = async () => ({ success: true });
  ctx.services.vcs.openFossilCheckout = async () => ({ success: true });
  ctx.services.vcs.openFossil = async () => ({ success: true });
  ctx.services.vcs.syncIgnoresToFossil = async () => ({ success: true });
  ctx.services.vcs.createFossilUser = async () => ({ success: true });
}

function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");

  const router = new Hono();
  const internalRouter = createInternalApiRouter(ctx);
  router.route("/api/internal", internalRouter);

  const sessions = createSessionsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const parsed = new URL(urlStr);
        return router.request(parsed.pathname + parsed.search, init);
      }
      return fetch(url, init);
    },
  });
  router.route("/projects/:projectId/sessions", sessions);

  return router;
}

describe("Session Creation Prefill", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-session-prefill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    mimoContext = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-session-prefill" },
      services: { sharedVcs: new DummyGitHttpServer() },
    });
    stubVcs(mimoContext);

    user1Token = await mimoContext.services.auth.generateToken("user1");
    const project = await mimoContext.repos.projects.create({
      name: "Prefill Project",
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/test/prefill",
          repoType: "git",
          mountPath: ".",
        },
      ],
      owner: "user1",
    });
    testProjectId = project.id;
    app = createTestApp(mimoContext);
  });

  afterEach?.(async () => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {
      // ignore
    }
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

  describe("GET /projects/:projectId/sessions/new", () => {
    it("prefills the session name field from ?name=", async () => {
      const res = await app.fetch(
        authed(
          `http://localhost/projects/${testProjectId}/sessions/new?name=dark-mode`,
        ),
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      const nameMatch = html.match(/<input[^>]*id="session-name-input"[^>]*>/);
      expect(nameMatch).not.toBeNull();
      expect(nameMatch![0]).toContain('value="dark-mode"');
    });

    it("prefills the branch name field from ?branchName=", async () => {
      const res = await app.fetch(
        authed(
          `http://localhost/projects/${testProjectId}/sessions/new?branchName=dark-mode`,
        ),
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('id="branch-name-input"');
      // The value attribute is prefilled verbatim with "dark-mode".
      const branchMatch = html.match(/<input[^>]*id="branch-name-input"[^>]*>/);
      expect(branchMatch).not.toBeNull();
      expect(branchMatch![0]).toContain('value="dark-mode"');
    });

    it("prefills the notes textarea from ?notes=", async () => {
      const res = await app.fetch(
        authed(
          `http://localhost/projects/${testProjectId}/sessions/new?notes=Add%20dark%20mode`,
        ),
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      // The notes textarea content is prefilled with the decoded notes text.
      expect(html).toContain("Add dark mode");
      expect(html).toContain('name="notes"');
    });

    it("renders with existing defaults when no prefill params are present", async () => {
      const res = await app.fetch(
        authed(`http://localhost/projects/${testProjectId}/sessions/new`),
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      // Branch field exists with no prefilled value (placeholder remains).
      const branchMatch = html.match(/<input[^>]*id="branch-name-input"[^>]*>/);
      expect(branchMatch).not.toBeNull();
      expect(branchMatch![0]).not.toMatch(/value="[^"]+"/);
    });
  });

  describe("POST /projects/:projectId/sessions", () => {
    it("writes the notes form field to the new session's notes.txt", async () => {
      const res = await app.fetch(
        authed(`http://localhost/projects/${testProjectId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            name: "Prefilled Session",
            branchName: "dark-mode",
            notes: "Add dark mode toggle",
          }).toString(),
        }),
      );
      // Successful session creation redirects to the session detail page.
      expect(res.status).toBe(302);
      const location = res.headers.get("location") || "";
      const sessionIdMatch = location.match(/\/sessions\/([^/]+)$/);
      expect(sessionIdMatch).not.toBeNull();
      const sessionId = sessionIdMatch![1];

      const notesContent =
        await mimoContext.services.frameState.loadNotes(sessionId);
      expect(notesContent).toBe("Add dark mode toggle");
    });

    it("does not require notes (existing behavior unchanged when absent)", async () => {
      const res = await app.fetch(
        authed(`http://localhost/projects/${testProjectId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            name: "No Notes Session",
            branchName: "feat-x",
          }).toString(),
        }),
      );
      expect(res.status).toBe(302);
    });
  });
});
