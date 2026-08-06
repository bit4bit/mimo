import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import { mkdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";

import { resetGlobalState } from "./test-helpers.js";

let projectRoutes: any;
let projectRepository: any;
let sessionRepository: any;
let userRepository: any;
let mimoContext: any;
let testHome: string;
let reachableRepoUrl: string;

// Helper to create test app with internal API mounted
function createTestApp(ctx: any, _projectsR: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createProjectsRoutes,
  } = require("../src/web/features/projects/pages/projects.tsx");

  const app = new Hono();

  // Mount internal API
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

  // Mount project routes with fetchFn that routes through app
  const projects = createProjectsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        // Extract the path from the full URL
        const path = new URL(urlStr).pathname;
        // For internal API calls, pass through the init directly
        // The internal API auth middleware will check Authorization header
        return app.request(path, init);
      }
      return fetch(url, init);
    },
  });
  app.route("/projects", projects);

  return app;
}

// Helper to make authenticated requests
type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function makeAuthRequest(
  app: Hono,
  path: string,
  token: string,
  options: RequestOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Cookie: `token=${token}`,
    ...options.headers,
  };
  return app.request(path, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });
}


async function createManagedRepoForTest(owner: string) {
  return mimoContext.repos.managedRepositories.create({
    name: "main-repo",
    repoUrl: reachableRepoUrl,
    repoType: "git",
    owner,
  });
}

function appendRepoPicker(
  formData: URLSearchParams,
  repo: { id: string },
  opts: { sourceBranch?: string; newBranch?: string } = {},
) {
  formData.append("repoSelected[]", repo.id);
  formData.append(`mountPath_${repo.id}`, ".");
  if (opts.sourceBranch)
    formData.append(`sourceBranch_${repo.id}`, opts.sourceBranch);
  if (opts.newBranch) formData.append(`newBranch_${repo.id}`, opts.newBranch);
}

describe("Project Management Integration Tests", () => {
  beforeEach(async () => {
    // Create unique test home for each test
    testHome = join(
      tmpdir(),
      `mimo-project-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    // Set up fresh environment with createMimoContext
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
    sessionRepository = ctx.repos.sessions;

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
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Project Creation", () => {
    it("should create a new project", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      // Create and authenticate user first
      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");
      const managedRepo = await createManagedRepoForTest("testuser");

      const formData = new URLSearchParams();
      appendRepoPicker(formData, managedRepo);
      formData.append("name", "My Test Project");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toMatch(/^\/projects\/[^\/]+$/);

      // Verify project was created
      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("My Test Project");
    });

    it("should reject project creation without authentication", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      const formData = new URLSearchParams();
      formData.append("name", "Test Project");
      formData.append("repoUrl", reachableRepoUrl);

      const res = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth/login");
    });

    it("should reject project with missing name", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("repoUrl", reachableRepoUrl);

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(400);
    });

    it("should reject invalid Git URL", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "Test Project");
      formData.append("repoUrl", "not-a-valid-url");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Project Creation with multiple picked repositories", () => {
    it("should create a project with all checked repositories", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

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

      const formData = new URLSearchParams();
      formData.append("name", "Two Repo Project");
      formData.append("repoSelected[]", repoA.id);
      formData.append("repoSelected[]", repoB.id);
      formData.append(`mountPath_${repoA.id}`, "repo-a");
      formData.append(`mountPath_${repoB.id}`, "repo-b");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(1);
      const entries = projects[0].repositories;
      expect(entries.length).toBe(2);
      expect(entries.map((entry: any) => entry.repoId).sort()).toEqual(
        [repoA.id, repoB.id].sort(),
      );
      expect(entries[0].repoId).toBe(repoA.id);
    });
  });

  describe("Project Listing", () => {
    it("should list all projects for authenticated user", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      // Create some projects
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo1.git", repoType: "git", mountPath: "." }],

        name: "Project 1",
        owner: "testuser",
      });

      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo2.git", repoType: "git", mountPath: "." }],

        name: "Project 2",
        owner: "testuser",
      });

      const res = await app.request("/projects", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Project 1");
      expect(html).toContain("Project 2");
      expect(html).toContain("Select a project");
      expect(html).not.toContain("Sessions for");
    });

    it("should render selected project sessions in unified page", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo1.git", repoType: "git", mountPath: "." }],

        name: "Project 1",
        owner: "testuser",
      });
      const project2 = await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo2.git", repoType: "git", mountPath: "." }],

        name: "Project 2",
        owner: "testuser",
      });

      await sessionRepository.create({
        name: "Session A",
        projectId: project2.id,
        owner: "testuser",
      });

      const res = await app.request(`/projects?selected=${project2.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Project 1");
      expect(html).toContain("Project 2");
      expect(html).toContain("Sessions for Project 2");
      expect(html).toContain("Session A");
      expect(html).toContain(`/projects?selected=${project2.id}`);
      expect(html).toContain(`/projects/${project2.id}/sessions/new`);
      expect(html).not.toContain("Select a project");
    });

    it("should show empty state when no projects", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const res = await app.request("/projects", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("No projects");
    });
  });

  describe("Project View", () => {
    it("should redirect legacy project detail URL to unified page", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const project = await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Test Project",
        owner: "testuser",
      });

      const res = await app.request(`/projects/${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        `/projects?selected=${project.id}`,
      );
    });

    it("should return 404 for non-existent project", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const res = await app.request("/projects/non-existent-id", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe("Project Deletion", () => {
    it("should delete project and cleanup files", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const project = await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Project To Delete",
        owner: "testuser",
      });

      const projectPath = join(testHome, "projects", project.id);
      expect(existsSync(projectPath)).toBe(true);

      const res = await app.request(`/projects/${project.id}/delete`, {
        method: "POST",
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/projects");

      // Verify project was deleted
      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(0);
      expect(existsSync(projectPath)).toBe(false);
    });
  });

  describe("Project Creation Form", () => {
    it("should show creation form", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");

      const res = await app.request("/projects/new", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Create Project");
      expect(html).toContain('action="/projects"');
      expect(html).not.toContain("Local Development Mirror");
      expect(html).not.toContain('name="defaultLocalDevMirrorPath"');
    });
  });

  describe("Project Description", () => {
    it("should create project with description", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");
      const managedRepo = await createManagedRepoForTest("testuser");

      const formData = new URLSearchParams();
      appendRepoPicker(formData, managedRepo);
      formData.append("name", "Project with Description");
      formData.append("description", "A test project description");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("Project with Description");
      expect(projects[0].description).toBe("A test project description");
    });

    it("should create project without description (backwards compatible)", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");
      const managedRepo = await createManagedRepoForTest("testuser");

      const formData = new URLSearchParams();
      appendRepoPicker(formData, managedRepo);
      formData.append("name", "Project Without Description");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("Project Without Description");
      expect(projects[0].description).toBeUndefined();
    });

    it("should reject description longer than 500 characters", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");
      const managedRepo = await createManagedRepoForTest("testuser");

      const longDescription = "a".repeat(501);
      const formData = new URLSearchParams();
      appendRepoPicker(formData, managedRepo);
      formData.append("name", "Test Project");
      formData.append("description", longDescription);

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("500 characters or less");
    });
  });

  describe("Project agentSubpath", () => {
    it("should create project with agentSubpath", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");
      const managedRepo = await createManagedRepoForTest("testuser");

      const formData = new URLSearchParams();
      appendRepoPicker(formData, managedRepo);
      formData.append("name", "Project with Agent Subpath");
      formData.append("agentSubpath", "packages/backend");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("Project with Agent Subpath");
      expect(projects[0].agentSubpath).toBe("packages/backend");
    });

    it("should create project without agentSubpath (backwards compatible)", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");
      const managedRepo = await createManagedRepoForTest("testuser");

      const formData = new URLSearchParams();
      appendRepoPicker(formData, managedRepo);
      formData.append("name", "Project Without Agent Subpath");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("Project Without Agent Subpath");
      expect(projects[0].agentSubpath).toBeUndefined();
    });

    it("should retrieve project with agentSubpath", async () => {
      const created = await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Agent Subpath Test Project",
        owner: "testuser",
        agentSubpath: "packages/api",
      });

      const found = await projectRepository.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.agentSubpath).toBe("packages/api");
    });

    it("should list projects with agentSubpath", async () => {
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo1.git", repoType: "git", mountPath: "." }],

        name: "List Agent Subpath Project 1",
        owner: "testuser",
        agentSubpath: "packages/web",
      });

      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo2.git", repoType: "git", mountPath: "." }],

        name: "List Agent Subpath Project 2",
        owner: "testuser",
        agentSubpath: "packages/cli",
      });

      const projects = await projectRepository.listByOwner("testuser");
      expect(projects.length).toBe(2);
      expect(
        projects.find((p: any) => p.name === "List Agent Subpath Project 1")
          ?.agentSubpath,
      ).toBe("packages/web");
      expect(
        projects.find((p: any) => p.name === "List Agent Subpath Project 2")
          ?.agentSubpath,
      ).toBe("packages/cli");
    });

    it("should store agentSubpath on session when provided explicitly", async () => {
      const project = await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Project for Session Test",
        owner: "testuser",
      });

      const session = await sessionRepository.create({
        name: "Session With Explicit Subpath",
        projectId: project.id,
        owner: "testuser",
        agentSubpath: "packages/api",
      });

      expect(session.agentSubpath).toBe("packages/api");
    });

    it("should resolve effective agentSubpath following the design spec", async () => {
      const project = await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Project for Resolution Test",
        owner: "testuser",
        agentSubpath: "packages/backend",
      });

      const testResolution = (
        agentSubpathRaw: string | undefined,
        projectAgentSubpath: string | undefined,
      ): string | undefined => {
        return (
          (agentSubpathRaw?.trim() || undefined) ??
          projectAgentSubpath ??
          undefined
        );
      };

      expect(testResolution(undefined, project.agentSubpath)).toBe(
        "packages/backend",
      );
      expect(testResolution("packages/api", project.agentSubpath)).toBe(
        "packages/api",
      );
      expect(testResolution("", project.agentSubpath)).toBe("packages/backend");
      expect(testResolution(undefined, undefined)).toBe(undefined);
    });
  });

  describe("Project Branch Fields", () => {
    it("should create project with sourceBranch only", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");
      const managedRepo = await createManagedRepoForTest("testuser");

      const formData = new URLSearchParams();
      appendRepoPicker(formData, managedRepo, { sourceBranch: "main" });
      formData.append("name", "Project with Source Branch");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("Project with Source Branch");
      expect(projects[0].repositories[0].sourceBranch).toBe("main");
      expect(projects[0].repositories[0].newBranch).toBeUndefined();
    });

    it("should create project with newBranch only", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");
      const managedRepo = await createManagedRepoForTest("testuser");

      const formData = new URLSearchParams();
      appendRepoPicker(formData, managedRepo, { newBranch: "ai-session-my-feature" });
      formData.append("name", "Project with New Branch");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("Project with New Branch");
      expect(projects[0].repositories[0].sourceBranch).toBeUndefined();
      expect(projects[0].repositories[0].newBranch).toBe("ai-session-my-feature");
    });

    it("should create project with both branch fields", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");
      const managedRepo = await createManagedRepoForTest("testuser");

      const formData = new URLSearchParams();
      appendRepoPicker(formData, managedRepo, { sourceBranch: "main", newBranch: "ai-session-feature-x" });
      formData.append("name", "Project with Both Branches");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("Project with Both Branches");
      expect(projects[0].repositories[0].sourceBranch).toBe("main");
      expect(projects[0].repositories[0].newBranch).toBe("ai-session-feature-x");
    });

    it("should create project without branch fields (backwards compatible)", async () => {
      const app = createTestApp(mimoContext, projectRoutes);

      await userRepository.create(
        "testuser",
        await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
      );
      const token = await mimoContext.services.auth.generateToken("testuser");
      const managedRepo = await createManagedRepoForTest("testuser");

      const formData = new URLSearchParams();
      appendRepoPicker(formData, managedRepo);
      formData.append("name", "Project Without Branches");

      const res = await app.request("/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `token=${token}`,
        },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);

      const projects = await projectRepository.listAll();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("Project Without Branches");
      expect(projects[0].repositories[0].sourceBranch).toBeUndefined();
      expect(projects[0].repositories[0].newBranch).toBeUndefined();
    });

    it("should retrieve project with branch fields", async () => {
      const created = await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", sourceBranch: "develop", newBranch: "ai-feature", mountPath: "." }],

        name: "Branch Test Project",
        owner: "testuser",
      });

      const found = await projectRepository.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.repositories[0]!.sourceBranch).toBe("develop");
      expect(found!.repositories[0]!.newBranch).toBe("ai-feature");
    });

    it("should list projects with branch fields", async () => {
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo1.git", repoType: "git", sourceBranch: "main", mountPath: "." }],

        name: "List Branch Project 1",
        owner: "testuser",
      });

      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo2.git", repoType: "git", newBranch: "ai-branch", mountPath: "." }],

        name: "List Branch Project 2",
        owner: "testuser",
      });

      const projects = await projectRepository.listByOwner("testuser");
      expect(projects.length).toBe(2);
      expect(
        projects.find((p: any) => p.name === "List Branch Project 1")
          ?.repositories[0]?.sourceBranch,
      ).toBe("main");
      expect(
        projects.find((p: any) => p.name === "List Branch Project 2")
          ?.repositories[0]?.newBranch,
      ).toBe("ai-branch");
    });
  });

  describe("Project List Ordering", () => {
    it("should list projects sorted alphabetically by name for an owner", async () => {
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Zebra Project",
        owner: "testuser",
      });
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Alpha Project",
        owner: "testuser",
      });
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Mango Project",
        owner: "testuser",
      });

      const projects = await projectRepository.listByOwner("testuser");
      expect(projects.map((p: any) => p.name)).toEqual([
        "Alpha Project",
        "Mango Project",
        "Zebra Project",
      ]);
    });

    it("should list all projects sorted alphabetically by name", async () => {
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Zulu",
        owner: "testuser",
      });
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Apple",
        owner: "testuser",
      });
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Banana",
        owner: "otheruser",
      });

      const projects = await projectRepository.listAll();
      expect(projects.map((p: any) => p.name)).toEqual([
        "Apple",
        "Banana",
        "Zulu",
      ]);
    });

    it("should keep stable order across repeated fetches", async () => {
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Delta",
        owner: "testuser",
      });
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Alpha",
        owner: "testuser",
      });
      await projectRepository.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/user/repo.git", repoType: "git", mountPath: "." }],

        name: "Charlie",
        owner: "testuser",
      });

      const first = await projectRepository.listByOwner("testuser");
      const second = await projectRepository.listByOwner("testuser");
      const third = await projectRepository.listByOwner("testuser");

      const expected = ["Alpha", "Charlie", "Delta"];
      expect(first.map((p: any) => p.name)).toEqual(expected);
      expect(second.map((p: any) => p.name)).toEqual(expected);
      expect(third.map((p: any) => p.name)).toEqual(expected);
    });
  });
});
