import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import bcrypt from "bcrypt";

// Re-import modules after setting up environment
let projectRoutes: any;
let projectRepository: any;
let authMiddleware: any;
let userRepository: any;

describe("Project Management Integration Tests", () => {
  const testHome = join(tmpdir(), `mimo-project-test-${Date.now()}`);

  beforeEach(async () => {
    // Set up fresh environment
    process.env.MIMO_HOME = testHome;
    process.env.JWT_SECRET = "test-secret-key-for-testing";

    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    // Re-import to get fresh modules
    const pathsModule = await import("../src/config/paths.ts");
    pathsModule.ensureMimoHome();

    const userModule = await import("../src/auth/user.ts");
    userRepository = userModule.userRepository;

    const middlewareModule = await import("../src/auth/middleware.ts");
    authMiddleware = middlewareModule.authMiddleware;

    const projectModule = await import("../src/projects/repository.ts");
    projectRepository = projectModule.projectRepository;

    const routesModule = await import("../src/projects/routes.tsx");
    projectRoutes = routesModule.default;
  });

  describe("Project Creation", () => {
    it("should create a new project", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      // Create and authenticate user first
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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
    });

    it("should show empty state when no projects", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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
    it("should show project details", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Test Project");
      expect(html).toContain("https://github.com/user/repo.git");
    });

    it("should return 404 for non-existent project", async () => {
      const app = new Hono();
      app.route("/projects", projectRoutes);

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
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

      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const res = await app.request("/projects/new", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Create Project");
      expect(html).toContain('action="/projects"');
    });
  });
});
