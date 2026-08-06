import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { resetGlobalState } from "./test-helpers.js";

let testHome: string;
let mimoContext: any;
let userRepository: any;
let projectRepository: any;
let projectRoutes: any;
let reachableRepoUrl: string;

function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createProjectsRoutes,
  } = require("../src/web/features/projects/pages/projects.tsx");

  const app = new Hono();

  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

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
  app.route("/projects", projects);

  return app;
}

describe("Session creation managed repository resolution", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-session-resolution-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "test-secret-key-for-testing",
        PLATFORM_URL: "http://localhost:3000",
        PORT: 3000,
      },
    });
    mimoContext = ctx;
    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;

    const upstreamRepo = join(testHome, "upstream-src");
    const bareRepo = join(testHome, "upstream.git");
    mkdirSync(upstreamRepo, { recursive: true });
    execSync("git init -q -b main", { cwd: upstreamRepo });
    execSync('git config user.email "test@example.com"', { cwd: upstreamRepo });
    execSync('git config user.name "test"', { cwd: upstreamRepo });
    writeFileSync(join(upstreamRepo, "README.md"), "# test\n");
    execSync("git add README.md", { cwd: upstreamRepo });
    execSync('git commit -qm "initial"', { cwd: upstreamRepo });
    execSync(`git clone --bare ${upstreamRepo} ${bareRepo}`);
    reachableRepoUrl = `file://${bareRepo}`;

    const { createProjectsRoutes } =
      await import("../src/web/features/projects/pages/projects.tsx");
    projectRoutes = createProjectsRoutes(ctx);
  });

  afterEach(async () => {
    await resetGlobalState();
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  async function setupUserAndProject() {
    await userRepository.create(
      "testuser",
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
    );
    const token = await mimoContext.services.auth.generateToken("testuser");

    const managed = await mimoContext.repos.managedRepositories.create({
      name: "main-repo",
      repoUrl: reachableRepoUrl,
      repoType: "git",
      owner: "testuser",
    });

    const project = await projectRepository.create({
      name: "Resolution Project",
      repoUrl: reachableRepoUrl,
      repoType: "git",
      owner: "testuser",
      repositories: [
        {
          id: "main-repo",
          name: "main-repo",
          repoId: managed.id,
          mountPath: ".",
          primary: true,
        },
      ],
    });

    return { token, managed, project };
  }

  function createApp() {
    return createTestApp(mimoContext);
  }

  it("should reject session creation when the referenced managed repository was deleted", async () => {
    const { token, managed, project } = await setupUserAndProject();
    const app = createApp();

    await mimoContext.repos.managedRepositories.delete(managed.id, "testuser");

    const formData = new URLSearchParams();
    formData.append("name", "Doomed Session");

    const res = await app.request(`/projects/${project.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: formData.toString(),
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("main-repo");
  });

  it("should create a session resolving connection details through the managed repository", async () => {
    const { token, project } = await setupUserAndProject();
    const app = createApp();

    const formData = new URLSearchParams();
    formData.append("name", "Resolved Session");

    const res = await app.request(`/projects/${project.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: formData.toString(),
    });

    expect(res.status).toBeLessThan(400);

    const sessions = await mimoContext.repos.sessions.listByProject(project.id);
    expect(sessions.length).toBe(1);
  }, 30000);

  it("should list files for every picked repository in the session file explorer", async () => {
    await userRepository.create(
      "testuser",
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
    );
    const token = await mimoContext.services.auth.generateToken("testuser");

    const repoA = await mimoContext.repos.managedRepositories.create({
      name: "repo-a",
      repoUrl: reachableRepoUrl,
      repoType: "git",
      owner: "testuser",
    });
    const repoB = await mimoContext.repos.managedRepositories.create({
      name: "repo-b",
      repoUrl: reachableRepoUrl,
      repoType: "git",
      owner: "testuser",
    });

    const project = await projectRepository.create({
      name: "Two Repo Project",
      repoUrl: reachableRepoUrl,
      repoType: "git",
      owner: "testuser",
      repositories: [
        {
          id: "repo-a",
          name: "repo-a",
          repoId: repoA.id,
          mountPath: "repo-a",
          primary: true,
        },
        {
          id: "repo-b",
          name: "repo-b",
          repoId: repoB.id,
          mountPath: "repo-b",
        },
      ],
    });

    const app = createApp();
    const formData = new URLSearchParams();
    formData.append("name", "Two Repo Session");
    const createRes = await app.request(`/projects/${project.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: formData.toString(),
    });
    expect(createRes.status).toBeLessThan(400);

    const sessions = await mimoContext.repos.sessions.listByProject(project.id);
    expect(sessions.length).toBe(1);
    const session = sessions[0];
    expect(session.repos.map((r: any) => r.projectRepoId).sort()).toEqual([
      "repo-a",
      "repo-b",
    ]);

    const filesRes = await app.request(`/projects/${project.id}/sessions/${session.id}/files`, {
      headers: { Cookie: `token=${token}` },
    });
    expect(filesRes.status).toBe(200);
    const files = await filesRes.json();
    const repoIds = [
      ...new Set(files.map((f: any) => f.repoId)),
    ].sort();
    expect(repoIds).toEqual(["repo-a", "repo-b"]);
  }, 30000);
});
