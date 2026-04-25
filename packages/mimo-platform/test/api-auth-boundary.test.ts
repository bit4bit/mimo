import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";

describe("API Auth Boundary Tests", () => {
  let app: Hono;
  let testHome: string;
  let generateToken: any;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-auth-boundary-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    const { createAuthRoutes } = await import("../src/auth/routes.tsx");
    const { authMiddleware } = await import("../src/auth/middleware.ts");
    const { registerHelpRoutes } = await import("../src/help/routes.js");

    app = new Hono();

    const PUBLIC_PATHS = [
      "/",
      "/health",
      "/api/projects/public",
      "/api/help",
    ];
    const PUBLIC_PATH_PREFIXES = [
      "/auth/",
      "/js/",
      "/vendor/",
      "/api/mimo-mcp",
    ];

    function isPublicPath(path: string): boolean {
      if (PUBLIC_PATHS.includes(path)) return true;
      return PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
    }

    app.use("*", async (c, next) => {
      const path = c.req.path;
      if (isPublicPath(path)) {
        return next();
      }
      return authMiddleware(c, next);
    });

    app.route("/auth", createAuthRoutes(ctx));

    app.get("/", async (c) => {
      const user = c.get("user") as { username: string } | undefined;
      const body = user
        ? `<!DOCTYPE html><html><body>Authenticated: ${user.username}</body></html>`
        : `<!DOCTYPE html><html><body>Not authenticated</body></html>`;
      return c.html(body);
    });

    app.get("/health", (c) => c.json({ status: "healthy" }));

    registerHelpRoutes(app);

    const jwtModule = await import("../src/auth/jwt.ts");
    generateToken = jwtModule.generateToken;
  });

  it("should redirect to /auth/login for removed /api/test endpoint (now protected)", async () => {
    const res = await app.request("/api/test");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/login");
  });

  it("should return 302 redirect to /auth/login for unauthenticated request to protected route", async () => {
    const res = await app.request("/sessions/anything");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/login");
  });

  it("should return 200 for /health without authentication", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("should return 200 for /auth/login without authentication", async () => {
    const res = await app.request("/auth/login");
    expect(res.status).toBe(200);
  });

  it("should return 200 for /auth/register without authentication", async () => {
    const res = await app.request("/auth/register");
    expect(res.status).toBe(200);
  });
});