import { describe, it, expect, beforeEach } from "bun:test";
import { setMimoHome, clearConfig } from "../src/config/global-config.js";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import bcrypt from "bcrypt";

let app: any;
let projectRepository: any;
let sessionRepository: any;
let userRepository: any;

describe("Project Sessions Link Integration Tests", () => {
  const testHome = join(tmpdir(), `mimo-project-sessions-test-${Date.now()}`);

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

    const sessionModule = await import("../src/sessions/repository.ts");
    sessionRepository = sessionModule.sessionRepository;

    app = new Hono();
    
    const authModule = await import("../src/auth/routes.tsx");
    app.route("/auth", authModule.default);

    const protectedModule = await import("../src/protected/routes.tsx");
    app.route("/", protectedModule.default);

    const projectsModule = await import("../src/projects/routes.tsx");
    app.route("/projects", projectsModule.default);
  });

  describe("Project Detail Page with Sessions", () => {
    it("should show sessions list on project detail page", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      await sessionRepository.create({
        name: "Feature Implementation",
        projectId: project.id,
        owner: "testuser",
      });

      await sessionRepository.create({
        name: "Bug Fix",
        projectId: project.id,
        owner: "testuser",
      });

      const res = await app.request(`/projects/${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Sessions");
      expect(html).toContain("Feature Implementation");
      expect(html).toContain("Bug Fix");
    });

    it("should show empty state when no sessions exist", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const project = await projectRepository.create({
        name: "Empty Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const res = await app.request(`/projects/${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("No sessions yet. Create one to start development.");
    });

    it("should show New Session button", async () => {
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
      expect(html).toContain("New Session");
      expect(html).toContain(`/projects/${project.id}/sessions/new`);
    });

    it("should show session links to session detail", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      const res = await app.request(`/projects/${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(`/projects/${project.id}/sessions/${session.id}`);
    });

    it("should order sessions by creation date (most recent first)", async () => {
      await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const project = await projectRepository.create({
        name: "Test Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const session1 = await sessionRepository.create({
        name: "First Session",
        projectId: project.id,
        owner: "testuser",
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const session2 = await sessionRepository.create({
        name: "Second Session",
        projectId: project.id,
        owner: "testuser",
      });

      const res = await app.request(`/projects/${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      
      // Second session should appear before first in the HTML
      const secondIndex = html.indexOf("Second Session");
      const firstIndex = html.indexOf("First Session");
      expect(secondIndex).toBeLessThan(firstIndex);
    });
  });
});