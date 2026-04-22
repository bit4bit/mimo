import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import bcrypt from "bcrypt";

// Re-import modules after setting up environment
let projectRoutes: any;
let projectRepository: any;
let sessionRepository: any;
let authMiddleware: any;
let userRepository: any;

describe("Project Management Integration Tests", () => {
  const testHome = join(tmpdir(), `mimo-project-test-${Date.now()}`);

  beforeEach(async () => {
    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    // Set up fresh environment with createMimoContext
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    userRepository = ctx.repos.users;

    const middlewareModule = await import("../src/auth/middleware.ts");
    authMiddleware = middlewareModule.authMiddleware;

    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;

    const { createProjectsRoutes } = await import("../src/projects/routes.tsx");
    projectRoutes = createProjectsRoutes(ctx);
  });

  describe("Project Creation", () => {
    it("should create a new project", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      // Create and authenticate user first
      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "My Test Project");
      formData.append("repoUrl", "https://github.com/user/repo.git");
      formData.append("repoType", "git");

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
      const app = new Hono();
      app.route("/projects", projectRoutes);

      const formData = new URLSearchParams();
      formData.append("name", "Test Project");
      formData.append("repoUrl", "https://github.com/user/repo.git");

      const res = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth/login");
    });

    it("should reject project with missing name", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("repoUrl", "https://github.com/user/repo.git");

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
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

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

  describe("Project Listing", () => {
    it("should list all projects for authenticated user", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      // Create some projects
      await projectRepository.create({
        name: "Project 1",
        repoUrl: "https://github.com/user/repo1.git",
        repoType: "git",
        owner: "testuser",
      });

      await projectRepository.create({
        name: "Project 2",
        repoUrl: "https://github.com/user/repo2.git",
        repoType: "git",
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
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      await projectRepository.create({
        name: "Project 1",
        repoUrl: "https://github.com/user/repo1.git",
        repoType: "git",
        owner: "testuser",
      });
      const project2 = await projectRepository.create({
        name: "Project 2",
        repoUrl: "https://github.com/user/repo2.git",
        repoType: "git",
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
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

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
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
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
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const res = await app.request("/projects/non-existent-id", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe("Project Deletion", () => {
    it("should delete project and cleanup files", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const project = await projectRepository.create({
        name: "Project To Delete",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
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
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

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
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "Project with Description");
      formData.append("repoUrl", "https://github.com/user/repo.git");
      formData.append("repoType", "git");
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
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "Project Without Description");
      formData.append("repoUrl", "https://github.com/user/repo.git");
      formData.append("repoType", "git");

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
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const longDescription = "a".repeat(501);
      const formData = new URLSearchParams();
      formData.append("name", "Test Project");
      formData.append("repoUrl", "https://github.com/user/repo.git");
      formData.append("repoType", "git");
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

  describe("Project Branch Fields", () => {
    it("should create project with sourceBranch only", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "Project with Source Branch");
      formData.append("repoUrl", "https://github.com/user/repo.git");
      formData.append("repoType", "git");
      formData.append("sourceBranch", "feature/v2");

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
      expect(projects[0].sourceBranch).toBe("feature/v2");
      expect(projects[0].newBranch).toBeUndefined();
    });

    it("should create project with newBranch only", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "Project with New Branch");
      formData.append("repoUrl", "https://github.com/user/repo.git");
      formData.append("repoType", "git");
      formData.append("newBranch", "ai-session-my-feature");

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
      expect(projects[0].sourceBranch).toBeUndefined();
      expect(projects[0].newBranch).toBe("ai-session-my-feature");
    });

    it("should create project with both branch fields", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "Project with Both Branches");
      formData.append("repoUrl", "https://github.com/user/repo.git");
      formData.append("repoType", "git");
      formData.append("sourceBranch", "main");
      formData.append("newBranch", "ai-session-feature-x");

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
      expect(projects[0].sourceBranch).toBe("main");
      expect(projects[0].newBranch).toBe("ai-session-feature-x");
    });

    it("should create project without branch fields (backwards compatible)", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const formData = new URLSearchParams();
      formData.append("name", "Project Without Branches");
      formData.append("repoUrl", "https://github.com/user/repo.git");
      formData.append("repoType", "git");

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
      expect(projects[0].sourceBranch).toBeUndefined();
      expect(projects[0].newBranch).toBeUndefined();
    });

    it("should retrieve project with branch fields", async () => {
      const created = await projectRepository.create({
        name: "Branch Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        sourceBranch: "develop",
        newBranch: "ai-feature",
      });

      const found = await projectRepository.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.sourceBranch).toBe("develop");
      expect(found!.newBranch).toBe("ai-feature");
    });

    it("should list projects with branch fields", async () => {
      await projectRepository.create({
        name: "List Branch Project 1",
        repoUrl: "https://github.com/user/repo1.git",
        repoType: "git",
        owner: "testuser",
        sourceBranch: "main",
      });

      await projectRepository.create({
        name: "List Branch Project 2",
        repoUrl: "https://github.com/user/repo2.git",
        repoType: "git",
        owner: "testuser",
        newBranch: "ai-branch",
      });

      const projects = await projectRepository.listByOwner("testuser");
      expect(projects.length).toBe(2);
      expect(
        projects.find((p) => p.name === "List Branch Project 1")?.sourceBranch,
      ).toBe("main");
      expect(
        projects.find((p) => p.name === "List Branch Project 2")?.newBranch,
      ).toBe("ai-branch");
    });
  });
});
