import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";

describe("Projects nested sessions with mimoContext", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mimo-projects-sessions-context-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    rmSync(testHome, { recursive: true, force: true });
  });

  it("uses injected auth service for nested sessions routes", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const { createProjectsRoutes } = await import("../src/projects/routes.tsx");

    const mimoContext = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "projects-sessions-context-secret-a",
      },
    });

    const project = await mimoContext.repos.projects.create({
      name: "Nested Sessions Context Project",
      repoUrl: "https://github.com/example/repo.git",
      repoType: "git",
      owner: "tester",
    });

    const token = await mimoContext.services.auth.generateToken("tester");

    const app = new Hono();
    app.route("/projects", createProjectsRoutes(mimoContext));

    const res = await app.request(`/projects/${project.id}/sessions`, {
      headers: {
        Cookie: `token=${token}`,
      },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/projects?selected=${project.id}`);
  });
});
