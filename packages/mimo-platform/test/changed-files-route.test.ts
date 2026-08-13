import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";

import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";
import { ChangedFilesCache } from "../src/domain/commits/changed-files-cache.js";
import type { ChangedFilesResult } from "../src/domain/files/changed-files.js";
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

describe("GET /sessions/:id/changed-files", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-changed-files-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    mimoContext = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "test-secret-key-changed-files",
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

  async function createSession() {
    const app = createTestApp(mimoContext);
    await userRepository.create(
      "testuser",
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
    );
    const project = await projectRepository.create({
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/user/repo.git",
          repoType: "git",
          mountPath: ".",
        },
      ],

      name: "Changed Files Project",
      owner: "testuser",
    });
    const token = await authService.generateToken("testuser");

    const createRes = await app.request(`/projects/${project.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: new URLSearchParams({ name: "Changed Session" }).toString(),
    });
    expect(createRes.status).toBe(302);
    const location = createRes.headers.get("location") || "";
    const sessionId = location.split("/").pop() || "";
    expect(sessionId.length).toBeGreaterThan(0);
    return { app, project, token, sessionId };
  }

  it("returns cached changed-files result on a cache hit without invoking detectChangedFiles", async () => {
    const { app, token, sessionId } = await createSession();

    const session = await mimoContext.repos.sessions.findById(sessionId);
    const upstreamPath = session.upstreamPath;
    const workspacePath = session.agentWorkspacePath;

    const cached: ChangedFilesResult = {
      files: [
        { repoId: "default", path: "src/a.ts", status: "added", size: 10 },
        { repoId: "default", path: "src/b.ts", status: "modified", size: 20 },
      ],
      summary: { added: 1, modified: 1, deleted: 0 },
    };
    const cache = new ChangedFilesCache();
    cache.set(sessionId, upstreamPath, workspacePath, cached, "default");

    const detectSpy = mock(() => Promise.resolve(cached));
    const changedFilesDeps = {
      changedFilesCache: cache,
      os: mimoContext.services.os as OS,
      detectChangedFiles: detectSpy as any,
      detectChangedFilesForRepos: detectSpy as any,
      createManifestStore: () => ({}) as any,
    };

    // Re-create app with the populated cache + spy.
    const appWithDeps = createTestApp(mimoContext, changedFilesDeps);
    const res = await appWithDeps.request(
      `/sessions/${sessionId}/changed-files`,
      {
        method: "GET",
        headers: { Cookie: `token=${token}` },
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ChangedFilesResult;
    expect(body).toEqual(cached);
    expect(detectSpy).toHaveBeenCalledTimes(0);
  });

  it("invokes detectChangedFiles on a cache miss, stores the result, then returns it", async () => {
    const { token, sessionId } = await createSession();

    const session = await mimoContext.repos.sessions.findById(sessionId);
    const upstreamPath = session.upstreamPath;
    const workspacePath = session.agentWorkspacePath;

    const detected: ChangedFilesResult = {
      files: [
        { repoId: "default", path: "lib/x.ts", status: "added", size: 42 },
      ],
      summary: { added: 1, modified: 0, deleted: 0 },
    };

    const cache = new ChangedFilesCache();
    const detectSpy = mock(() => Promise.resolve(detected));
    const manifestStore = {
      load: () => Promise.resolve({}),
      save: () => Promise.resolve(),
      invalidate: () => Promise.resolve(),
    };
    const createManifestStoreSpy = mock(() => manifestStore);
    const osSpy = {
      ...mimoContext.services.os,
      path: {
        ...mimoContext.services.os.path,
        dirname: () => "/sessions/parent",
        join: (...segs: string[]) => segs.join("/"),
      },
    } as unknown as OS;

    const changedFilesDeps = {
      changedFilesCache: cache,
      os: osSpy,
      detectChangedFiles: detectSpy as any,
      detectChangedFilesForRepos: detectSpy as any,
      createManifestStore: createManifestStoreSpy as any,
    };

    const app = createTestApp(mimoContext, changedFilesDeps);
    const res = await app.request(`/sessions/${sessionId}/changed-files`, {
      method: "GET",
      headers: { Cookie: `token=${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ChangedFilesResult;
    expect(body).toEqual(detected);

    expect(detectSpy).toHaveBeenCalledTimes(1);
    const calls = detectSpy.mock.calls as any[];
    expect(calls[0][1][0].upstreamPath).toBe(upstreamPath);
    expect(calls[0][1][0].workspacePath).toBe(workspacePath);
    expect(createManifestStoreSpy).toHaveBeenCalledTimes(0);

    // The result is stored in the cache so a subsequent hit avoids detection.
    const cachedHit = cache.get(
      sessionId,
      upstreamPath,
      workspacePath,
      "default",
    );
    expect(cachedHit).toEqual(detected);
  });

  it("returns 404 { error: 'Session not found' } when the session id does not resolve", async () => {
    const cache = new ChangedFilesCache();
    const detectSpy = mock(() => Promise.resolve({} as ChangedFilesResult));
    const changedFilesDeps = {
      changedFilesCache: cache,
      os: mimoContext.services.os as OS,
      detectChangedFiles: detectSpy as any,
      detectChangedFilesForRepos: detectSpy as any,
      createManifestStore: () => ({}) as any,
    };

    const app = createTestApp(mimoContext, changedFilesDeps);
    const token = await authService.generateToken("testuser");
    await userRepository.create(
      "testuser",
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
    );

    const res = await app.request(`/sessions/does-not-exist/changed-files`, {
      method: "GET",
      headers: { Cookie: `token=${token}` },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Session not found" });
    expect(detectSpy).toHaveBeenCalledTimes(0);
  });

  it("does not scope upstream/workspace paths to session.agentSubpath — file explorer shows the full workspace", async () => {
    const { token, sessionId } = await createSession();

    // Set an agentSubpath on the session (the agent runs inside this subdir).
    // This must NOT affect changed-file detection — the file explorer and
    // changed-files buffer reflect the entire workspace.
    await mimoContext.repos.sessions.update(sessionId, {
      agentSubpath: "src",
    });
    const session = await mimoContext.repos.sessions.findById(sessionId);

    const detected: ChangedFilesResult = {
      files: [{ repoId: "default", path: "a.ts", status: "added", size: 1 }],
      summary: { added: 1, modified: 0, deleted: 0 },
    };

    const cache = new ChangedFilesCache();
    const detectSpy = mock(() => Promise.resolve(detected));
    const manifestStore = {
      load: () => Promise.resolve({}),
      save: () => Promise.resolve(),
      invalidate: () => Promise.resolve(),
    };
    const createManifestStoreSpy = mock(() => manifestStore);
    const osSpy = {
      ...mimoContext.services.os,
      path: {
        ...mimoContext.services.os.path,
        dirname: () => "/sessions/parent",
        join: (...segs: string[]) => segs.join("/"),
      },
    } as unknown as OS;

    const changedFilesDeps = {
      changedFilesCache: cache,
      os: osSpy,
      detectChangedFiles: detectSpy as any,
      detectChangedFilesForRepos: detectSpy as any,
      createManifestStore: createManifestStoreSpy as any,
    };

    const app = createTestApp(mimoContext, changedFilesDeps);
    const res = await app.request(`/sessions/${sessionId}/changed-files`, {
      method: "GET",
      headers: { Cookie: `token=${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ChangedFilesResult;
    expect(body).toEqual(detected);

    // Detection runs against the unscoped workspace paths — agentSubpath
    // only affects the agent's ACP cwd, not the file explorer.
    expect(detectSpy).toHaveBeenCalledTimes(1);
    const calls = detectSpy.mock.calls as any[];
    expect(calls[0][1][0].upstreamPath).toBe(session.upstreamPath);
    expect(calls[0][1][0].workspacePath).toBe(session.agentWorkspacePath);

    // The cached entry uses the unscoped workspace path.
    const cachedHit = cache.get(
      sessionId,
      session.upstreamPath,
      session.agentWorkspacePath,
      "default",
    );
    expect(cachedHit).toEqual(detected);
  });
});
