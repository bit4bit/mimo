import { describe, it, expect, beforeEach } from "bun:test";
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
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;

    app = new Hono();

    const authModule = await import("../src/auth/routes.tsx");
    app.route("/auth", authModule.createAuthRoutes(ctx));

    const protectedModule = await import("../src/protected/routes.tsx");
    app.route("/", protectedModule.default);

    const projectsModule = await import("../src/projects/routes.tsx");
    app.route("/projects", projectsModule.createProjectsRoutes(ctx));
  });

  describe("Unified Projects Sessions Page", () => {
    it("should show sessions list when a project is selected", async () => {
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

      const res = await app.request(`/projects?selected=${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(`Sessions for ${project.name}`);
      expect(html).toContain("Feature Implementation");
      expect(html).toContain("Bug Fix");
    });

    it("should show empty session state when no sessions exist", async () => {
      await userRepository.create(
        "testuser",
        await bcrypt.hash("testpass", 10),
      );
      const { generateToken } = await import("../src/auth/jwt.ts");
      const token = await generateToken("testuser");

      const project = await projectRepository.create({
        name: "Empty Project",
        repoUrl: "https://github.com/user/repo.git",
        repoType: "git",
        owner: "testuser",
      });

      const res = await app.request(`/projects?selected=${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("No sessions yet.");
    });

    it("should show New Session button", async () => {
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

      const res = await app.request(`/projects?selected=${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("+ New Session");
      expect(html).toContain(`/projects/${project.id}/sessions/new`);
    });

    it("should show session links to session detail", async () => {
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

      const session = await sessionRepository.create({
        name: "Test Session",
        projectId: project.id,
        owner: "testuser",
      });

      const res = await app.request(`/projects?selected=${project.id}`, {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(`/projects/${project.id}/sessions/${session.id}`);
    });

    it("should order sessions by recency when priorities are equal", async () => {
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

      await sessionRepository.create({
        name: "First Session",
        projectId: project.id,
        owner: "testuser",
        priority: "medium",
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await sessionRepository.create({
        name: "Second Session",
        projectId: project.id,
        owner: "testuser",
        priority: "medium",
      });

      const res = await app.request(`/projects?selected=${project.id}`, {
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
