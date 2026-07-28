// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

let mimoContext: any;
let app: Hono;
let user1Token: string;
let testProjectId: string;
let testSessionId: string;

function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const { createPinnedRoutes } = require("../src/web/features/pinned-sessions/pages/pinned.tsx");
  const { createSessionsRoutes } = require("../src/web/features/sessions/pages/sessions.tsx");

  const router = new Hono();

  const internalRouter = createInternalApiRouter(ctx);
  router.route("/api/internal", internalRouter);

  const sessions = createSessionsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const path = new URL(urlStr).pathname;
        return router.request(path, init);
      }
      return fetch(url, init);
    },
  });
  router.route("/projects/:projectId/sessions", sessions);

  const pinned = createPinnedRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const path = new URL(urlStr).pathname;
        return router.request(path, init);
      }
      return fetch(url, init);
    },
  });
  router.route("/pinned", pinned);

  return router;
}

describe("Pinned Sessions Web Routes", () => {
  beforeAll(async () => {
    const testHome = join(
      tmpdir(),
      `mimo-pinned-web-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const { createMimoContext } = await import(
      "../src/infrastructure/context/mimo-context.ts"
    );
    mimoContext = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-pinned-web" },
      services: { sharedVcs: new DummyGitHttpServer() },
    });

    user1Token = await mimoContext.services.auth.generateToken("user1");

    const project = await mimoContext.repos.projects.create({
      name: "Pinned Web Project",
      repoUrl: "https://github.com/test/pinned-web",
      repoType: "git",
      owner: "user1",
    });
    testProjectId = project.id;

    const session = await mimoContext.repos.sessions.create({
      name: "Pinned Web Session",
      projectId: testProjectId,
      owner: "user1",
    });
    testSessionId = session.id;

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

  it("redirects to /auth/login when unauthenticated", async () => {
    const res = await app.fetch(new Request("http://localhost/pinned"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/auth/login");
  });

  it("renders the empty state when the user has no pins", async () => {
    const res = await app.fetch(authed("http://localhost/pinned"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Pin a session first");
    expect(html).not.toContain("<iframe");
  });

  it("renders one column per pin with the correct iframe src", async () => {
    // Pin two sessions.
    const s2 = await mimoContext.repos.sessions.create({
      name: "Second Web Session",
      projectId: testProjectId,
      owner: "user1",
    });
    await mimoContext.repos.pinnedSessions.add("user1", {
      sessionId: testSessionId,
      projectId: testProjectId,
    });
    await mimoContext.repos.pinnedSessions.add("user1", {
      sessionId: s2.id,
      projectId: testProjectId,
    });

    const res = await app.fetch(authed("http://localhost/pinned"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(
      `/projects/${testProjectId}/sessions/${testSessionId}?embed=1`,
    );
    expect(html).toContain(
      `/projects/${testProjectId}/sessions/${s2.id}?embed=1`,
    );
    expect(html).toContain("Pinned Web Session");
    expect(html).toContain("Second Web Session");
  });

  it("renders a stale placeholder column for missing sessions", async () => {
    const ghostId = "ghost-session-" + Math.random().toString(36).slice(2, 8);
    await mimoContext.repos.pinnedSessions.add("user1", {
      sessionId: ghostId,
      projectId: testProjectId,
    });

    const res = await app.fetch(authed("http://localhost/pinned"));
    const html = await res.text();
    expect(html).toContain("session no longer exists");
    // The stale entry should render an unpin button but no iframe pointing at it.
    expect(html).toContain(`data-unpin-session-id="${ghostId}"`);
    expect(html).not.toContain(
      `/projects/${testProjectId}/sessions/${ghostId}?embed=1`,
    );
  });

  it("renders the selection-required empty state when ?ids= is empty but pins exist", async () => {
    const res = await app.fetch(authed("http://localhost/pinned?ids="));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(
      "Select at least one session to view in parallel",
    );
    expect(html).not.toContain("<iframe");
  });

  it("renders only the sessions listed in ?ids= in that order", async () => {
    // Two pins exist already (testSessionId + second). Pin a third.
    const s3 = await mimoContext.repos.sessions.create({
      name: "Third Web Session",
      projectId: testProjectId,
      owner: "user1",
    });
    await mimoContext.repos.pinnedSessions.add("user1", {
      sessionId: s3.id,
      projectId: testProjectId,
    });

    // Ask for only s3 in the parallel view.
    const res = await app.fetch(
      authed(`http://localhost/pinned?ids=${s3.id}`),
    );
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(
      `/projects/${testProjectId}/sessions/${s3.id}?embed=1`,
    );
    // The other pinned sessions are NOT rendered.
    expect(html).not.toContain(
      `/projects/${testProjectId}/sessions/${testSessionId}?embed=1`,
    );
  });

  it("ignores ?ids= entries that aren't in the user's pin store", async () => {
    const res = await app.fetch(
      authed(
        `http://localhost/pinned?ids=${testSessionId},not-a-real-pin-id`,
      ),
    );
    const html = await res.text();
    expect(html).toContain(
      `/projects/${testProjectId}/sessions/${testSessionId}?embed=1`,
    );
    expect(html).not.toContain("not-a-real-pin-id");
  });

  it("renders the drawer's parallel action labeled \"View selected in parallel\"", async () => {
    // Any authenticated page renders the drawer shell via Layout. Hit /pinned
    // to get a Layout-wrapped response.
    const res = await app.fetch(authed("http://localhost/pinned?ids="));
    const html = await res.text();
    expect(html).toContain("View selected in parallel");
    expect(html).toContain('id="pinned-drawer-parallel-link"');
  });

  it("renders the side-menu button and drawer shell on the /pinned page", async () => {
    const res = await app.fetch(authed("http://localhost/pinned"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('id="pinned-menu-btn"');
    expect(html).toContain('id="pinned-drawer-root"');
    expect(html).toContain('src="/js/pinned-sessions-drawer.js"');
  });

  it("wires the drawer client script that drives selection + ?ids=", async () => {
    // Hitting the session page renders a Layout-wrapped response (drawer shell +
    // the drawer script tag).
    const res = await app.fetch(
      authed(
        `http://localhost/projects/${testProjectId}/sessions/${testSessionId}`,
      ),
    );
    const html = await res.text();
    expect(html).toContain('src="/js/pinned-sessions-drawer.js"');
    // The drawer shell exposes the link the script updates on toggle.
    expect(html).toContain('id="pinned-drawer-parallel-link"');
    // Default href (before JS runs) still targets /pinned.
    expect(html).toMatch(/id="pinned-drawer-parallel-link"[^>]*href="\/pinned"/);
  });
});

describe("Session page embed mode", () => {
  beforeEach(async () => {
    const testHome = join(
      tmpdir(),
      `mimo-embed-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const { createMimoContext } = await import(
      "../src/infrastructure/context/mimo-context.ts"
    );
    mimoContext = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-embed" },
      services: { sharedVcs: new DummyGitHttpServer() },
    });
    user1Token = await mimoContext.services.auth.generateToken("user1");
    const project = await mimoContext.repos.projects.create({
      name: "Embed Project",
      repoUrl: "https://github.com/test/embed",
      repoType: "git",
      owner: "user1",
    });
    testProjectId = project.id;
    const session = await mimoContext.repos.sessions.create({
      name: "Embed Session",
      projectId: testProjectId,
      owner: "user1",
    });
    testSessionId = session.id;
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

  it("suppresses top-nav, footer-bar, and shortcuts-bar in embed mode", async () => {
    const res = await app.fetch(
      authed(
        `http://localhost/projects/${testProjectId}/sessions/${testSessionId}?embed=1`,
      ),
    );
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("MIMO_EMBED = true");
    // Embed mode omits the side-menu button, drawer, footer, and shortcuts bar.
    expect(html).not.toContain('id="pinned-menu-btn"');
    expect(html).not.toContain('id="pinned-drawer-root"');
    expect(html).not.toContain('class="session-footer-bar"');
    expect(html).not.toContain('id="session-shortcuts-bar"');
    expect(html).not.toContain('id="session-pin-checkbox"');
  });

  it("hides Summary, MCP, and Plan right-frame buffers in embed mode", async () => {
    const res = await app.fetch(
      authed(
        `http://localhost/projects/${testProjectId}/sessions/${testSessionId}?embed=1`,
      ),
    );
    const html = await res.text();
    expect(res.status).toBe(200);
    // The right frame in embed mode only renders Files, Impact, and Notes.
    // Right-frame tabs are emitted as data-buffer-id attributes on
    // frame-tab buttons scoped to frame="right".
    const rightFrameBlock = html.match(
      /<div class="frame frame-right"[\s\S]*?<\/div>\s*<\/div>\s*<button[^>]*id="right-frame-restore-btn"/,
    );
    expect(rightFrameBlock).not.toBeNull();
    const rightHtml = rightFrameBlock![0];
    expect(rightHtml).toContain('data-buffer-id="file-tree"');
    expect(rightHtml).toContain('data-buffer-id="impact"');
    expect(rightHtml).toContain('data-buffer-id="notes"');
    expect(rightHtml).not.toContain('data-buffer-id="summary"');
    expect(rightHtml).not.toContain('data-buffer-id="mcp-servers"');
    expect(rightHtml).not.toContain('data-buffer-id="plan"');
  });

  it("renders all right-frame buffers without the embed flag", async () => {
    const res = await app.fetch(
      authed(
        `http://localhost/projects/${testProjectId}/sessions/${testSessionId}`,
      ),
    );
    const html = await res.text();
    expect(res.status).toBe(200);
    const rightFrameBlock = html.match(
      /<div class="frame frame-right"[\s\S]*?<\/div>\s*<\/div>\s*<button[^>]*id="right-frame-restore-btn"/,
    );
    expect(rightFrameBlock).not.toBeNull();
    const rightHtml = rightFrameBlock![0];
    expect(rightHtml).toContain('data-buffer-id="file-tree"');
    expect(rightHtml).toContain('data-buffer-id="impact"');
    expect(rightHtml).toContain('data-buffer-id="notes"');
    expect(rightHtml).toContain('data-buffer-id="summary"');
    expect(rightHtml).toContain('data-buffer-id="mcp-servers"');
    expect(rightHtml).toContain('data-buffer-id="plan"');
  });

  it("renders full chrome without the embed flag", async () => {
    const res = await app.fetch(
      authed(
        `http://localhost/projects/${testProjectId}/sessions/${testSessionId}`,
      ),
    );
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('id="pinned-menu-btn"');
    expect(html).toContain('id="pinned-drawer-root"');
    expect(html).toContain('class="session-footer-bar"');
    expect(html).toContain('id="session-shortcuts-bar"');
    expect(html).toContain('id="session-pin-checkbox"');
  });

  it("reflects pinned state on the pin checkbox", async () => {
    await mimoContext.repos.pinnedSessions.add("user1", {
      sessionId: testSessionId,
      projectId: testProjectId,
    });
    const res = await app.fetch(
      authed(
        `http://localhost/projects/${testProjectId}/sessions/${testSessionId}`,
      ),
    );
    const html = await res.text();
    expect(html).toContain('id="session-pin-checkbox"');
    expect(html).toMatch(/session-pin-checkbox[^>]*checked/);
  });

  it("renders unchecked pin checkbox when not pinned", async () => {
    const res = await app.fetch(
      authed(
        `http://localhost/projects/${testProjectId}/sessions/${testSessionId}`,
      ),
    );
    const html = await res.text();
    expect(html).toContain('id="session-pin-checkbox"');
    // No `checked` attribute on the pin checkbox (the literal "checked" in
    // `this.checked` is JS, not an HTML attribute — strip onchange first).
    const checkboxMatch = html.match(
      /<input[^>]*id="session-pin-checkbox"[^>]*>/,
    );
    expect(checkboxMatch).not.toBeNull();
    const opening = checkboxMatch![0].replace(/onchange="[^"]*"/, "");
    expect(opening).not.toMatch(/\bchecked\b/);
  });
});