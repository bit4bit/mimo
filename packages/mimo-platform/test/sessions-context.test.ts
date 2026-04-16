import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";

describe("Sessions routes with mimoContext", () => {
let testHome: string;

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mimo-sessions-context-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    rmSync(testHome, { recursive: true, force: true });
  });

  it("uses injected auth service for token verification", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const { createSessionsRoutes } = await import("../src/sessions/routes.tsx");

    const mimoContext = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "sessions-context-secret-a",
      },
      services: { sharedFossil: new DummySharedFossilServer() },
    });

    const token = await mimoContext.services.auth.generateToken("tester");

    const app = new Hono();
    app.route("/sessions", createSessionsRoutes(mimoContext));

    const res = await app.request("/sessions?projectId=missing-project", {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });

    expect(res.status).toBe(404);
  });
});
