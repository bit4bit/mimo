import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import bcrypt from "bcrypt";

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
      await import("../src/context/mimo-context.ts");
    const { createAuthRoutes } = await import("../src/auth/routes.tsx");

    const passwordHash = await bcrypt.hash("secret-pass", 10);
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
      },
    });

    const app = new Hono();
    app.route(
      "/auth",
      createAuthRoutes({
        ...mimoContext,
        repos: {
          ...mimoContext.repos,
          users: fakeUserRepo,
        },
      } as any),
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
