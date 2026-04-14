import { describe, it, expect, beforeEach } from "bun:test";
import { setMimoHome, clearConfig } from "../src/config/global-config.js";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import bcrypt from "bcrypt";

let app: any;
let projectRepository: any;
let userRepository: any;

describe("Public Landing Page Integration Tests", () => {
  const testHome = join(tmpdir(), `mimo-landing-test-${Date.now()}`);

  beforeEach(async () => {
    setMimoHome(testHome);
    process.env.JWT_SECRET = "test-secret-key-for-testing";

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    const pathsModule = await import("../src/config/paths.ts");
    pathsModule.ensureMimoHome();

    const userModule = await import("../src/auth/user.ts");
    userRepository = userModule.userRepository;

    const projectModule = await import("../src/projects/repository.ts");
    projectRepository = projectModule.projectRepository;

    app = new Hono();
    
    const authModule = await import("../src/auth/routes.tsx");
    app.route("/auth", authModule.default);

    const protectedModule = await import("../src/protected/routes.tsx");
    app.route("/", protectedModule.default);

    const projectsModule = await import("../src/projects/routes.tsx");
    app.route("/projects", projectsModule.default);

    const LandingPageModule = await import("../src/components/LandingPage.tsx");
    const LandingPage = LandingPageModule.LandingPage;

    app.get("/", async (c) => {
      const publicProjects = await projectRepository.listAllPublic();
      const user = c.get("user") as { username: string } | undefined;
      const isAuthenticated = !!user;
      const username = user?.username;
      return c.html(<LandingPage projects={publicProjects} isAuthenticated={isAuthenticated} username={username} />);
    });

    app.get("/api/projects/public", async (c) => {
      const publicProjects = await projectRepository.listAllPublic();
      return c.json(publicProjects);
    });
  });

  describe("Landing Page", () => {
    it("should show landing page without authentication", async () => {
      const res = await app.request("/");

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("MIMO");
      expect(html).toContain("Minimal IDE for Modern Operations");
      expect(html).toContain("Login");
      expect(html).toContain("Register");
    });

    it("should show projects list on landing page", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      await projectRepository.create({
        name: "Public Project 1",
        repoUrl: "https://github.com/user/repo1.git",
        repoType: "git",
        owner: "testuser",
        description: "First public project",
      });

      await projectRepository.create({
        name: "Public Project 2",
        repoUrl: "https://github.com/user/repo2.git",
        repoType: "git",
        owner: "testuser",
      });

      const res = await app.request("/");

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Public Project 1");
      expect(html).toContain("First public project");
      expect(html).toContain("Public Project 2");
      expect(html).toContain("No description");
    });

    it("should show empty state when no projects exist", async () => {
      const res = await app.request("/");

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("No projects yet");
    });

    it("should show authenticated state with username", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const res = await app.request("/", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("MIMO");
    });

    it("should not show repoUrl on public landing page", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://secret-repo.example.com/repo.git",
        repoType: "git",
        owner: "testuser",
        description: "A test project",
      });

      const res = await app.request("/");

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Test Project");
      expect(html).not.toContain("secret-repo.example.com");
    });
  });

  describe("Public Projects API", () => {
    it("should return public projects without authentication", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      await projectRepository.create({
        name: "Public Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        description: "A public project",
      });

      const res = await app.request("/api/projects/public");

      expect(res.status).toBe(200);
      const projects = await res.json();
      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("Public Project");
      expect(projects[0].description).toBe("A public project");
      expect(projects[0].owner).toBe("testuser");
      expect(projects[0].repoType).toBe("git");
    });

    it("should return empty array when no projects exist", async () => {
      const res = await app.request("/api/projects/public");

      expect(res.status).toBe(200);
      const projects = await res.json();
      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBe(0);
    });

    it("should exclude sensitive fields from public API", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        description: "Test desc",
      });

      const res = await app.request("/api/projects/public");

      expect(res.status).toBe(200);
      const projects = await res.json();
      const project = projects[0];

      expect(project.id).toBeDefined();
      expect(project.name).toBeDefined();
      expect(project.description).toBeDefined();
      expect(project.repoType).toBeDefined();
      expect(project.owner).toBeDefined();
      expect(project.createdAt).toBeDefined();

      expect(project.repoUrl).toBeUndefined();
    });

    it("should handle projects without description", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      await projectRepository.create({
        name: "Project No Desc",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const res = await app.request("/api/projects/public");

      expect(res.status).toBe(200);
      const projects = await res.json();
      expect(projects[0].description).toBeUndefined();
    });
  });

  describe("Project Card Links", () => {
    it("should link to project detail page", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        description: "Test desc",
      });

      const res = await app.request("/");

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(`href="/projects/${project.id}"`);
    });

    it("should redirect to login when unauthenticated user clicks project", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const project = await projectRepository.create({
        name: "Protected Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const res = await app.request(`/projects/${project.id}`);

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth/login");
    });

    it("should show project detail when authenticated user clicks", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const project = await projectRepository.create({
        name: "My Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        description: "My description",
      });

      const res = await app.request(`/projects/${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("My Project");
      expect(html).toContain("My description");
    });
  });

  describe("Description Display", () => {
    it("should truncate long descriptions on landing page", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const longDescription = "a".repeat(250);
      await projectRepository.create({
        name: "Long Desc Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        description: longDescription,
      });

      const res = await app.request("/");

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("...");
    });

    it("should show full description on project detail page", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const description = "This is a full description that should appear completely.";
      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
        description,
      });

      const res = await app.request(`/projects/${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(description);
    });

    it("should show 'No description' placeholder when missing", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      await projectRepository.create({
        name: "No Desc Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const res = await app.request("/");

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("No description");
    });
  });

  describe("Backwards Compatibility", () => {
    it("should load projects created without description field", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));

      const project = await projectRepository.create({
        name: "Old Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const res = await app.request("/api/projects/public");

      expect(res.status).toBe(200);
      const projects = await res.json();
      expect(projects[0].name).toBe("Old Project");
      expect(projects[0].description).toBeUndefined();
    });
  });
});