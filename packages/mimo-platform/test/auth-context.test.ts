import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";

describe("Auth middleware with mimoContext", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(tmpdir(), `mimo-auth-context-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    rmSync(testHome, { recursive: true, force: true });
  });

  it("verifies token using injected auth service secret", async () => {
    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const { createAuthMiddleware } = await import("../src/auth/middleware.ts");

    const mimoContext = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "context-auth-secret-a",
      },
    });

    const token = await mimoContext.services.auth.generateToken("context-user");

    const app = new Hono();
    app.get("/protected", createAuthMiddleware(mimoContext.services.auth), (c) => c.text("ok"));

    const res = await app.request("/protected", {
      headers: {
        Cookie: `token=${token}`,
      },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
