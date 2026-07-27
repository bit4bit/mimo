// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for the JWT auth middleware used by the internal API.
 *
 * These tests cover both the Bearer-header path (used by API clients) and the
 * `token` cookie fallback (used by same-origin browser fetches that cannot
 * read the HttpOnly cookie from JS).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createInternalAuthMiddleware } from "./auth.js";
import { successResponse } from "./response.js";
import { createMimoContext } from "../../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../../infrastructure/os/mock-adapter.js";

describe("createInternalAuthMiddleware", () => {
  let mimoContext: ReturnType<typeof createMimoContext>;
  let mockOS: MockOS;
  let validToken: string;

  beforeAll(async () => {
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-internal-auth-middleware",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-internal-auth",
        MIMO_INTERNAL_VCS_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;
    mockOS.fs.seed({
      "/tmp/test-mimo-internal-auth": null,
      "/tmp/test-mimo-internal-auth/users": null,
      "/tmp/test-mimo-internal-auth/projects": null,
      "/tmp/test-mimo-internal-auth/agents": null,
      "/tmp/test-mimo-internal-auth/mcp-servers": null,
      "/tmp/test-mimo-internal-auth/session-repos": null,
    });

    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-internal-auth-middleware",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo-internal-auth",
        MIMO_VCS_REPOS_DIR: "/tmp/test-mimo-internal-auth/session-repos",
        MIMO_INTERNAL_VCS_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    validToken = await mimoContext.services.auth.generateToken("jova");

    const app = new Hono();
    app.use("/*", createInternalAuthMiddleware(mimoContext));
    app.get("/_whoami", (c) => c.json(successResponse({ ok: true })));
    (globalThis as any).__authApp = app;
  });

  function app(): Hono {
    return (globalThis as any).__authApp;
  }

  it("accepts a valid Bearer token in the Authorization header", async () => {
    const res = await app().fetch(
      new Request("http://localhost/_whoami", {
        headers: { Authorization: `Bearer ${validToken}` },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts a valid `token` cookie when no Authorization header is sent", async () => {
    const res = await app().fetch(
      new Request("http://localhost/_whoami", {
        headers: { Cookie: `token=${validToken}` },
      }),
    );
    expect(res.status).toBe(200);
  });

  it(
    "still accepts the cookie when a non-Bearer Authorization header is also present " +
      "(e.g. a reverse proxy or browser extension injecting its own scheme)",
    async () => {
      const res = await app().fetch(
        new Request("http://localhost/_whoami", {
          headers: {
            Cookie: `token=${validToken}`,
            Authorization: "SomeOtherScheme some-malformed-value",
          },
        }),
      );
      // The cookie is the legitimate credential. A non-Bearer Authorization
      // header must not block cookie-based auth for same-origin fetches.
      expect(res.status).toBe(200);
    },
  );

  it("rejects when neither a Bearer header nor a token cookie is present", async () => {
    const res = await app().fetch(new Request("http://localhost/_whoami"));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("rejects when Authorization is Bearer but token is invalid", async () => {
    const res = await app().fetch(
      new Request("http://localhost/_whoami", {
        headers: { Authorization: "Bearer not-a-real-token" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
