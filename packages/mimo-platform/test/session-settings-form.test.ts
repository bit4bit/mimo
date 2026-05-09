import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { DummySharedFossilServer } from "../src/domain/vcs/shared-fossil-server.js";

let sessionRepository: any;
let userRepository: any;
let projectRepository: any;
let authService: any;
let testHome: string;
let mimoContext: any;

function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");

  const app = new Hono();

  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

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
  app.route("/projects/:projectId/sessions", sessions);
  app.route("/sessions", sessions);

  return app;
}

describe("Session Settings Form POST", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-settings-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
      services: { sharedFossil: new DummySharedFossilServer() },
    });

    mimoContext = ctx;
    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;
    authService = ctx.services.auth;

    ctx.services.vcs.cloneRepository = async () => ({ success: true });
    ctx.services.vcs.importToFossil = async () => ({ success: true });
    ctx.services.vcs.openFossilCheckout = async () => ({ success: true });
    ctx.services.vcs.openFossil = async () => ({ success: true });
    ctx.services.vcs.syncIgnoresToFossil = async () => ({ success: true });
    ctx.services.vcs.createFossilUser = async () => ({ success: true });
  });

  it("should update idle timeout via form POST", async () => {
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

    const res = await app.request(`/projects/${project.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: new URLSearchParams({ name: "Test Session" }).toString(),
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    const sessionId = location.split("/").pop();

    // Update idle timeout via form POST
    const postRes = await app.request(
      `/projects/${project.id}/sessions/${sessionId}/settings/timeout`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: new URLSearchParams({
          idleTimeoutMs: "120000",
          sessionTtlDays: "90",
        }).toString(),
      },
    );

    expect(postRes.status).toBe(302);

    const updatedSession = await sessionRepository.findById(sessionId!);
    expect(updatedSession?.idleTimeoutMs).toBe(120000);
    expect(updatedSession?.sessionTtlDays).toBe(90);
  });

  it("should include idleTimeoutMs in session API response", async () => {
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

    const res = await app.request(`/projects/${project.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: new URLSearchParams({ name: "Test Session" }).toString(),
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    const sessionId = location.split("/").pop();

    // Get session via internal API
    const sessionRes = await app.request(
      `/api/internal/sessions/${sessionId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    expect(sessionRes.status).toBe(200);
    const data = await sessionRes.json();
    
    // BUG: idleTimeoutMs is missing from the API response!
    expect(data.data.session.idleTimeoutMs).toBeDefined();
  });
});
