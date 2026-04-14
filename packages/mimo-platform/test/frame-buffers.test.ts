import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import bcrypt from "bcrypt";

let sessionRoutes: any;
let sessionRepository: any;
let userRepository: any;
let projectRepository: any;
let generateToken: any;

describe("Frame buffers integration", () => {
  const testHome = join(tmpdir(), `mimo-frame-buffers-${Date.now()}`);

  beforeEach(async () => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({ env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" } });

    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;

    const jwtModule = await import("../src/auth/jwt.ts");
    generateToken = jwtModule.generateToken;

    const vcsModule = await import("../src/vcs/index.ts");
    vcsModule.vcs.cloneRepository = async () => ({ success: true });
    vcsModule.vcs.importToFossil = async () => ({ success: true });
    vcsModule.vcs.openFossilCheckout = async () => ({ success: true });
    vcsModule.vcs.openFossil = async () => ({ success: true });
    vcsModule.vcs.createFossilUser = async () => ({ success: true });

    const { createSessionsRoutes } = await import("../src/sessions/routes.tsx");
    sessionRoutes = createSessionsRoutes(ctx);
  });

  async function createSessionAppAndAuth() {
    const app = new Hono();
    app.route("/projects/:projectId/sessions", sessionRoutes);
    app.route("/sessions", sessionRoutes);

    await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
    const project = await projectRepository.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const token = await generateToken("testuser");

    const createRes = await app.request(`/projects/${project.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: new URLSearchParams({ name: "Frame Session" }).toString(),
    });

    expect(createRes.status).toBe(302);
    const location = createRes.headers.get("location") || "";
    const sessionId = location.split("/").pop() || "";
    expect(sessionId.length).toBeGreaterThan(0);

    return { app, project, token, sessionId };
  }

  it("shows left Chat/Notes tabs and right Impact tab", async () => {
    const { app, project, token, sessionId } = await createSessionAppAndAuth();

    const res = await app.request(`/projects/${project.id}/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });

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

  it("persists frame-state updates per session", async () => {
    const { app, token, sessionId } = await createSessionAppAndAuth();

    const initialState = await app.request(`/sessions/${sessionId}/frame-state`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });

    expect(initialState.status).toBe(200);
    const initialJson = await initialState.json();
    expect(initialJson.leftFrame.activeBufferId).toBe("chat");
    expect(initialJson.rightFrame.activeBufferId).toBe("impact");

    const updateState = await app.request(`/sessions/${sessionId}/frame-state`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `token=${token}`,
      },
      body: JSON.stringify({ frame: "right", activeBufferId: "notes" }),
    });

    expect(updateState.status).toBe(200);

    const updatedState = await app.request(`/sessions/${sessionId}/frame-state`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });
    const updatedJson = await updatedState.json();
    expect(updatedJson.leftFrame.activeBufferId).toBe("chat");
    expect(updatedJson.rightFrame.activeBufferId).toBe("notes");
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
    const notesPath = join(testHome, "projects", project.id, "sessions", sessionId, "notes.txt");
    expect(existsSync(notesPath)).toBe(false);
  });
});
