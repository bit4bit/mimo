import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";

describe("Auth routes with injected user repository", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mimo-auth-routes-context-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    rmSync(testHome, { recursive: true, force: true });
  });

  it("logs in using credentials from injected user repository", async () => {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const { createInternalApiRouter } = await import(
      "../src/api/rest/index.ts"
    );
    const { createAuthInternalRouter } = await import(
      "../src/api/rest/auth.ts"
    );
    const { createAuthRoutes } =
      await import("../src/web/features/auth/pages/auth.tsx");

    const passwordHash = await Bun.password.hash("secret-pass", {
      algorithm: "bcrypt",
      cost: 10,
    });
    const fakeUserRepo = {
      async getCredentials(username: string) {
        if (username !== "alice") {
          return null;
        }
        return {
          username,
          passwordHash,
          createdAt: new Date().toISOString(),
        };
      },
      async create() {
        throw new Error("not used in this test");
      },
    };

    const mimoContext = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "auth-route-context-secret",
        PLATFORM_URL: "http://localhost",
        PLATFORM_V2_URL: "http://platform-v2",
      },
    });
    const authContext = {
      ...mimoContext,
      repos: {
        ...mimoContext.repos,
        users: fakeUserRepo,
      },
    } as any;

    const authUpstreamApp = new Hono();
    authUpstreamApp.use("*", async (c, next) => {
      c.set("mimoContext", authContext);
      await next();
    });
    authUpstreamApp.route(
      "/api/internal/auth",
      createAuthInternalRouter(authContext),
    );
    const internalApp = new Hono();
    internalApp.route(
      "/api/internal",
      createInternalApiRouter(authContext, {
        fetchFn: ((input, init) =>
          authUpstreamApp.fetch(new Request(input, init))) as typeof fetch,
      }),
    );

    const app = new Hono();
    app.route(
      "/auth",
      createAuthRoutes(authContext, {
        fetchFn: ((input, init) =>
          internalApp.fetch(new Request(input, init))) as typeof fetch,
      }),
    );

    const formData = new URLSearchParams();
    formData.append("username", "alice");
    formData.append("password", "secret-pass");

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/dashboard");
  });
});
