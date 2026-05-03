import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { DummySharedFossilServer } from "../src/domain/vcs/shared-fossil-server.js";

describe("Debug", () => {
  it("debug session creation", async () => {
    const testHome = join(tmpdir(), `mimo-debug-${Date.now()}`);
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret" },
      services: { sharedFossil: new DummySharedFossilServer() },
    });

    ctx.services.vcs.cloneRepository = async () => ({ success: true });
    ctx.services.vcs.importToFossil = async () => ({ success: true });
    ctx.services.vcs.openFossilCheckout = async () => ({ success: true });
    ctx.services.vcs.openFossil = async () => ({ success: true });
    ctx.services.vcs.syncIgnoresToFossil = async () => ({ success: true });
    ctx.services.vcs.createFossilUser = async () => ({ success: true });

    const userRepository = ctx.repos.users;
    const projectRepository = ctx.repos.projects;
    const authService = ctx.services.auth;

    await userRepository.create(
      "testuser",
      await Bun.password.hash("testpass"),
    );
    const project = await projectRepository.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });
    const token = await authService.generateToken("testuser");

    const { createSessionsRoutes } =
      await import("../src/web/features/sessions/pages/sessions.tsx");
    const sessionRoutes = createSessionsRoutes(ctx);
    const app = new Hono();
    app.route("/projects/:projectId/sessions", sessionRoutes);

    const res = await app.request(`/projects/${project.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: new URLSearchParams({
        name: "Feature Branch Session",
        agentSubpath: "src/backend",
        branchName: "feature/test",
      }).toString(),
    });

    console.log("STATUS:", res.status);
    const text = await res.text();
    console.log("BODY:", text);
  });
});
