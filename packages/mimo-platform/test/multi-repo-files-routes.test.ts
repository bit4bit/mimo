import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync } from "fs";

import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";
import { ChangedFilesCache } from "../src/domain/commits/changed-files-cache.js";
import type { OS } from "../src/infrastructure/os/types.js";

let testHome: string;
let mimoContext: any;
let userRepository: any;
let projectRepository: any;
let authService: any;

function createTestApp(ctx: any, changedFilesDeps?: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createProjectsRoutes,
  } = require("../src/web/features/projects/pages/projects.tsx");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");

  const app = new Hono();
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

  const fetchFn = (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();
    if (urlStr.includes("/api/internal/")) {
      const path = new URL(urlStr).pathname;
      return app.request(path, init);
    }
    return fetch(url, init);
  };

  const projects = createProjectsRoutes(ctx, { fetchFn });
  const sessions = createSessionsRoutes(ctx, {
    fetchFn,
    changedFiles: changedFilesDeps,
  });

  app.route("/projects", projects);
  app.route("/projects/:projectId/sessions", sessions);
  app.route("/sessions", sessions);
  return app;
}

describe("Multi-repo session files + changed-files routes", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-multirepo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    mimoContext = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "test-secret-key-multirepo-files",
        PLATFORM_URL: "http://localhost:3000",
      },
      services: { sharedVcs: new DummyGitHttpServer() },
    });

    mimoContext.services.vcs.cloneRepository = async () => ({ success: true });
    mimoContext.services.vcs.importToFossil = async () => ({ success: true });
    mimoContext.services.vcs.seedSessionRepo = async () => ({ success: true });
    mimoContext.services.vcs.clonePlatformCheckout = async () => ({
      success: true,
    });
    mimoContext.services.vcs.syncIgnoresToGit = async () => ({ success: true });
    mimoContext.services.vcs.openFossilCheckout = async () => ({
      success: true,
    });
    mimoContext.services.vcs.openFossil = async () => ({ success: true });
    mimoContext.services.vcs.createFossilUser = async () => ({ success: true });

    userRepository = mimoContext.repos.users;
    projectRepository = mimoContext.repos.projects;
    authService = mimoContext.services.auth;
  });

  afterEach(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  async function createMultiRepoSession() {
    const app = createTestApp(mimoContext);
    await userRepository.create(
      "testuser",
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
    );
    const project = await projectRepository.create({
      name: "Multi Repo Project",
      owner: "testuser",
      repositories: [
        {
          id: "second",
          name: "Second",
          repoUrl: "https://github.com/test/second",
          repoType: "git",
          mountPath: "second",
          primary: true,
        },
        {
          id: "third",
          name: "Third",
          repoUrl: "https://github.com/test/third",
          repoType: "git",
          mountPath: "third",
        },
      ],
    });
    const token = await authService.generateToken("testuser");

    const createRes = await app.request(`/projects/${project.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: new URLSearchParams({ name: "Multi Repo Session" }).toString(),
    });
    expect(createRes.status).toBe(302);
    const location = createRes.headers.get("location") || "";
    const sessionId = location.split("/").pop() || "";
    expect(sessionId.length).toBeGreaterThan(0);
    return { app, project, token, sessionId };
  }

  it("GET /sessions/:id/changed-files detects a new file in the 'second' repo as repo-qualified added", async () => {
    const { token, sessionId } = await createMultiRepoSession();

    const session = await mimoContext.repos.sessions.findById(sessionId);
    // The second repo workspace path.
    const secondWorkspace = session.repos.find(
      (r: any) => r.projectRepoId === "second",
    ).workspacePath;
    const secondUpstream = session.repos.find(
      (r: any) => r.projectRepoId === "second",
    ).upstreamPath;

    // Agent creates second/test.md in the workspace (not in upstream).
    mkdirSync(secondWorkspace, { recursive: true });
    writeFileSync(join(secondWorkspace, "test.md"), "# hello");

    // Use the real detectChangedFilesForRepos (real filesystem).
    const changedFilesDeps = {
      changedFilesCache: new ChangedFilesCache(),
      os: mimoContext.services.os as OS,
    };
    const app = createTestApp(mimoContext, changedFilesDeps);

    const res = await app.request(`/sessions/${sessionId}/changed-files`, {
      method: "GET",
      headers: { Cookie: `token=${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const secondTest = body.files.find(
      (f: any) => f.repoId === "second" && f.path === "test.md",
    );
    expect(secondTest).toBeDefined();
    expect(secondTest.status).toBe("added");
  });

  it("GET /sessions/:id/files lists a new file in the 'second' repo with repoId", async () => {
    const { token, sessionId } = await createMultiRepoSession();

    const session = await mimoContext.repos.sessions.findById(sessionId);
    const secondWorkspace = session.repos.find(
      (r: any) => r.projectRepoId === "second",
    ).workspacePath;

    mkdirSync(secondWorkspace, { recursive: true });
    writeFileSync(join(secondWorkspace, "test.md"), "# hello");

    const app = createTestApp(mimoContext);

    const res = await app.request(`/sessions/${sessionId}/files`, {
      method: "GET",
      headers: { Cookie: `token=${token}` },
    });

    expect(res.status).toBe(200);
    const files = (await res.json()) as any[];
    const secondTest = files.find(
      (f: any) => f.repoId === "second" && f.path === "test.md",
    );
    expect(secondTest).toBeDefined();
  });

  it("GET /sessions/:id/files/content reads a file from the 'second' repo when repoId is provided", async () => {
    const { token, sessionId } = await createMultiRepoSession();

    const session = await mimoContext.repos.sessions.findById(sessionId);
    const secondWorkspace = session.repos.find(
      (r: any) => r.projectRepoId === "second",
    ).workspacePath;

    mkdirSync(secondWorkspace, { recursive: true });
    writeFileSync(join(secondWorkspace, "test.md"), "# hello");

    const app = createTestApp(mimoContext);

    const res = await app.request(
      `/sessions/${sessionId}/files/content?path=test.md&repoId=second`,
      {
        method: "GET",
        headers: { Cookie: `token=${token}` },
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.content).toBeDefined();
  });

  it("GET /sessions/:id/impact returns per-repo metrics including the new file in 'second'", async () => {
    const { token, sessionId } = await createMultiRepoSession();

    const session = await mimoContext.repos.sessions.findById(sessionId);
    const secondWorkspace = session.repos.find(
      (r: any) => r.projectRepoId === "second",
    ).workspacePath;

    mkdirSync(secondWorkspace, { recursive: true });
    writeFileSync(join(secondWorkspace, "test.md"), "# hello");

    // Use the synchronous (non-background) impact path by omitting
    // impactBackground in the route deps. Stub scc as not installed so the
    // route returns basic file counts.
    const app = createTestApp(mimoContext);
    const sccService = mimoContext.services.scc;
    sccService.isInstalled = () => false;

    const res = await app.request(`/sessions/${sessionId}/impact`, {
      method: "GET",
      headers: { Cookie: `token=${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // The non-background, multi-repo branch returns { repos, metrics, ... }.
    // The new file in 'second' should be counted.
    expect(body.files?.new ?? body.metrics?.files?.new ?? 0).toBeGreaterThan(0);
  });
});
