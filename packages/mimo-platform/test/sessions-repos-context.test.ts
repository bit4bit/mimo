import { beforeEach, describe, expect, it } from "bun:test";
import { setMimoHome, clearConfig } from "../src/config/global-config.js";
import { Hono } from "hono";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";

describe("Sessions routes with injected repositories", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(tmpdir(), `mimo-sessions-repos-context-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    rmSync(testHome, { recursive: true, force: true });
    setMimoHome(testHome);
  });

  it("uses injected project and session repositories", async () => {
    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const { createSessionsRoutes } = await import("../src/sessions/routes.tsx");

    const mimoContext = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "sessions-repos-context-secret",
      },
    });

    const token = await mimoContext.services.auth.generateToken("tester");

    const fakeProjectRepo = {
      async findById(projectId: string) {
        return {
          id: projectId,
          name: "Injected Project",
          owner: "tester",
          repoUrl: "https://github.com/example/repo.git",
          repoType: "git",
          createdAt: new Date(),
        };
      },
    };

    const fakeSessionRepo = {
      async listByProject() {
        return [];
      },
    };

    const app = new Hono();
    app.route(
      "/sessions",
      createSessionsRoutes({
        services: {
          auth: mimoContext.services.auth,
        },
        repos: {
          projects: fakeProjectRepo,
          sessions: fakeSessionRepo,
        },
      } as any)
    );

    const res = await app.request("/sessions?projectId=project-injected", {
      headers: {
        Cookie: `token=${token}`,
      },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Injected Project");
  });
});
