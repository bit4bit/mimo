import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync, writeFileSync } from "fs";

import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

let sessionRepository: any;
let userRepository: any;
let projectRepository: any;
let authService: any;
let mimoContext: any;
let testHome: string;

// Helper to create test app with internal API mounted
function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createProjectsRoutes,
  } = require("../src/web/features/projects/pages/projects.tsx");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");

  const app = new Hono();

  // Mount internal API
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

  // Mount routes with fetchFn that routes through app
  const projects = createProjectsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const path = new URL(urlStr).pathname;
        return app.request(path, init);
      }
      return fetch(url, init);
    },
  });

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

  app.route("/projects", projects);
  app.route("/projects/:projectId/sessions", sessions);
  app.route("/sessions", sessions);

  return app;
}

describe("Frame buffers integration", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-frame-buffers-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "test-secret-key-for-frame-buffers",
        PLATFORM_URL: "http://localhost:3000",
      },
      services: { sharedVcs: new DummyGitHttpServer() },
    });

    mimoContext = ctx;
    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;
    authService = ctx.services.auth;

    ctx.services.vcs.cloneRepository = async () => ({ success: true });
    ctx.services.vcs.importToFossil = async () => ({ success: true });
    ctx.services.vcs.seedSessionRepo = async () => ({ success: true });
    ctx.services.vcs.clonePlatformCheckout = async () => ({ success: true });
    ctx.services.vcs.syncIgnoresToGit = async () => ({ success: true });
    ctx.services.vcs.openFossilCheckout = async () => ({ success: true });
    ctx.services.vcs.openFossil = async () => ({ success: true });
    ctx.services.vcs.createFossilUser = async () => ({ success: true });
  });

  afterEach(() => {
    // Cleanup
  });

  async function createSessionAppAndAuth() {
    const app = createTestApp(mimoContext);

    await userRepository.create(
      "testuser",
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
    );
    const project = await projectRepository.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const token = await authService.generateToken("testuser");

    const createRes = await app.request(`/projects/${project.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: new URLSearchParams({ name: "Frame Session" }).toString(),
    });

    const body = await createRes.text();
    expect(createRes.status).toBe(302);
    const location = createRes.headers.get("location") || "";
    const sessionId = location.split("/").pop() || "";
    expect(sessionId.length).toBeGreaterThan(0);

    return { app, project, token, sessionId };
  }

  it("shows left Chat/Notes tabs and right Impact tab", async () => {
    const { app, project, token, sessionId } = await createSessionAppAndAuth();

    const res = await app.request(
      `/projects/${project.id}/sessions/${sessionId}`,
      {
        method: "GET",
        headers: {
          Cookie: `token=${token}`,
        },
      },
    );

    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('data-frame-id="left"');
    expect(html).toContain('data-frame-id="right"');
    expect(html).toContain('data-buffer-id="chat"');
    expect(html).toContain('data-buffer-id="impact"');
    expect(html).toContain('data-buffer-id="notes"');

    const leftFrameStart = html.indexOf('data-frame-id="left"');
    const rightFrameStart = html.indexOf('data-frame-id="right"');
    const notesIndex = html.indexOf('data-buffer-id="notes"');
    expect(rightFrameStart).toBeGreaterThan(leftFrameStart);
    expect(notesIndex).toBeGreaterThan(rightFrameStart);
  });

  it("renders chat input styles that keep Send compact and status aligned", async () => {
    const { app, project, token, sessionId } = await createSessionAppAndAuth();

    const res = await app.request(
      `/projects/${project.id}/sessions/${sessionId}`,
      {
        method: "GET",
        headers: {
          Cookie: `token=${token}`,
        },
      },
    );

    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(".editable-send-btn {");
    expect(html).toContain(".editable-bubble-header {");
    expect(html).toContain(".editable-bubble-status {");
    expect(html).toContain("padding: 1px 8px");
    expect(html).toContain("justify-content: flex-start");
  });

  it("renders the diff change-navigation overview track and module", async () => {
    const { app, project, token, sessionId } = await createSessionAppAndAuth();

    const res = await app.request(
      `/projects/${project.id}/sessions/${sessionId}`,
      {
        method: "GET",
        headers: {
          Cookie: `token=${token}`,
        },
      },
    );

    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('src="/js/diff-overview.js"');
    expect(html).toContain('id="patch-overview-track"');
    expect(html).toContain('id="patch-change-counter"');
    expect(html).toContain(".diff-overview-track");
    expect(html).toContain(".diff-overview-tick--mixed");
  });

  it("renders session keybindings footer bar and script", async () => {
    const { app, project, token, sessionId } = await createSessionAppAndAuth();

    const res = await app.request(
      `/projects/${project.id}/sessions/${sessionId}`,
      {
        method: "GET",
        headers: {
          Cookie: `token=${token}`,
        },
      },
    );

    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('src="/js/session-keybindings.js"');
    expect(html).toContain('id="session-shortcuts-bar"');
    expect(html).not.toContain('id="session-shortcuts-help"');
    expect(html).toContain("Mod+Shift+N");
    expect(html).toContain("Mod+Shift+ArrowRight");
    expect(html).toContain("Mod+Shift+ArrowLeft");
    expect(html).toContain("Mod+Shift+M");
    expect(html).toContain("Mod+Shift+,");
    expect(html).toContain("Mod+Shift+.");
    expect(html).toContain("Mod+Shift+/");
    expect(html).toContain("Alt+Shift+Control+F");
    expect(html).toContain('id="right-frame-toggle-btn"');
    expect(html).toContain('id="right-frame-restore-btn"');
    expect(html).toContain('id="mcp-right-frame-toggle-btn"');
  });

  it("renders configured session keybindings from yaml config", async () => {
    writeFileSync(
      join(testHome, "config.yaml"),
      [
        "theme: dark",
        "fontSize: 14",
        "sessionKeybindings:",
        '  nextThread: "Mod+Shift+L"',
        '  closeModal: "Escape"',
        '  toggleRightFrame: "Alt+Shift+Control+G"',
      ].join("\n"),
      "utf-8",
    );

    const { app, project, token, sessionId } = await createSessionAppAndAuth();

    const res = await app.request(
      `/projects/${project.id}/sessions/${sessionId}`,
      {
        method: "GET",
        headers: {
          Cookie: `token=${token}`,
        },
      },
    );

    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("window.MIMO_SESSION_KEYBINDINGS");
    expect(html).toContain('"nextThread":"Mod+Shift+L"');
    expect(html).toContain('"closeModal":"Escape"');
    expect(html).toContain('"toggleRightFrame":"Alt+Shift+Control+G"');
    expect(html).toContain("Mod+Shift+L");
    expect(html).toContain("Alt+Shift+Control+G");
  });

  it("persists frame-state updates per session", async () => {
    const { app, token, sessionId } = await createSessionAppAndAuth();

    const initialState = await app.request(
      `/sessions/${sessionId}/frame-state`,
      {
        method: "GET",
        headers: {
          Cookie: `token=${token}`,
        },
      },
    );

    expect(initialState.status).toBe(200);
    const initialJson = await initialState.json();
    expect(initialJson.leftFrame.activeBufferId).toBe("chat");
    expect(initialJson.rightFrame.activeBufferId).toBe("impact");
    expect(initialJson.rightFrame.isCollapsed).toBe(false);

    const updateState = await app.request(
      `/sessions/${sessionId}/frame-state`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${token}`,
        },
        body: JSON.stringify({ frame: "right", activeBufferId: "notes" }),
      },
    );

    expect(updateState.status).toBe(200);

    const updatedState = await app.request(
      `/sessions/${sessionId}/frame-state`,
      {
        method: "GET",
        headers: {
          Cookie: `token=${token}`,
        },
      },
    );
    const updatedJson = await updatedState.json();
    expect(updatedJson.leftFrame.activeBufferId).toBe("chat");
    expect(updatedJson.rightFrame.activeBufferId).toBe("notes");
    expect(updatedJson.rightFrame.isCollapsed).toBe(false);

    const collapseState = await app.request(
      `/sessions/${sessionId}/frame-state`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${token}`,
        },
        body: JSON.stringify({ frame: "right", isCollapsed: true }),
      },
    );

    expect(collapseState.status).toBe(200);
    const collapseJson = await collapseState.json();
    expect(collapseJson.rightFrame.activeBufferId).toBe("notes");
    expect(collapseJson.rightFrame.isCollapsed).toBe(true);

    const restoredState = await app.request(
      `/sessions/${sessionId}/frame-state`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `token=${token}`,
        },
        body: JSON.stringify({ frame: "right", isCollapsed: false }),
      },
    );

    expect(restoredState.status).toBe(200);
    const restoredJson = await restoredState.json();
    expect(restoredJson.rightFrame.activeBufferId).toBe("notes");
    expect(restoredJson.rightFrame.isCollapsed).toBe(false);
  });

  it("auto-save notes endpoint persists content", async () => {
    const { app, project, token, sessionId } = await createSessionAppAndAuth();

    const saveRes = await app.request(`/sessions/${sessionId}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `token=${token}`,
      },
      body: JSON.stringify({ content: "draft note" }),
    });
    expect(saveRes.status).toBe(200);

    const readRes = await app.request(`/sessions/${sessionId}/notes`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });
    expect(readRes.status).toBe(200);
    const notesJson = await readRes.json();
    expect(notesJson.content).toBe("draft note");

    await app.request(`/projects/${project.id}/sessions/${sessionId}/delete`, {
      method: "POST",
      headers: {
        Cookie: `token=${token}`,
      },
    });

    const session = await sessionRepository.findById(sessionId);
    expect(session).toBeNull();
    const notesPath = join(
      testHome,
      "projects",
      project.id,
      "sessions",
      sessionId,
      "notes.txt",
    );
    expect(existsSync(notesPath)).toBe(false);
  });

  it("GET /projects/:id/notes returns project notes content", async () => {
    const { app, project, token } = await createSessionAppAndAuth();

    const res = await app.request(`/projects/${project.id}/notes`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content).toBe("");
  });

  it("POST /projects/:id/notes persists project notes independently of session notes", async () => {
    const { app, project, token, sessionId } = await createSessionAppAndAuth();

    const saveProjectRes = await app.request(`/projects/${project.id}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `token=${token}`,
      },
      body: JSON.stringify({ content: "project note" }),
    });
    expect(saveProjectRes.status).toBe(200);

    const saveSessionRes = await app.request(`/sessions/${sessionId}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `token=${token}`,
      },
      body: JSON.stringify({ content: "session note" }),
    });
    expect(saveSessionRes.status).toBe(200);

    const readProjectRes = await app.request(`/projects/${project.id}/notes`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });
    const projectJson = await readProjectRes.json();
    expect(projectJson.content).toBe("project note");

    const readSessionRes = await app.request(`/sessions/${sessionId}/notes`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });
    const sessionJson = await readSessionRes.json();
    expect(sessionJson.content).toBe("session note");
  });

  it("project notes survive session deletion", async () => {
    const { app, project, token, sessionId } = await createSessionAppAndAuth();

    const saveProjectRes = await app.request(`/projects/${project.id}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `token=${token}`,
      },
      body: JSON.stringify({ content: "persistent project note" }),
    });
    expect(saveProjectRes.status).toBe(200);

    await app.request(`/projects/${project.id}/sessions/${sessionId}/delete`, {
      method: "POST",
      headers: {
        Cookie: `token=${token}`,
      },
    });

    const session = await sessionRepository.findById(sessionId);
    expect(session).toBeNull();

    const readRes = await app.request(`/projects/${project.id}/notes`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });
    expect(readRes.status).toBe(200);
    const json = await readRes.json();
    expect(json.content).toBe("persistent project note");

    const notesPath = join(testHome, "projects", project.id, "notes.txt");
    expect(existsSync(notesPath)).toBe(true);
  });

  it("NotesBuffer renders both project and session notes sections", async () => {
    const { app, project, token, sessionId } = await createSessionAppAndAuth();

    const res = await app.request(
      `/projects/${project.id}/sessions/${sessionId}`,
      {
        method: "GET",
        headers: {
          Cookie: `token=${token}`,
        },
      },
    );

    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Project Notes");
    expect(html).toContain("Session Notes");
    expect(html).toContain('id="project-notes-input"');
    expect(html).toContain('id="notes-input"');
  });
});
