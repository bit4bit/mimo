// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for the internal API router.
 *
 * These tests verify that the internal API router:
 * - Is mounted at /api/internal/*
 * - Requires Bearer token authentication
 * - Returns standardized JSON responses
 * - Provides the health check endpoint
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "./index.js";
import { createMimoContext } from "../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../infrastructure/os/mock-adapter.js";

describe("Internal API Router", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let mockOS: MockOS;
  let validToken: string;

  beforeAll(async () => {
    // Set up mock OS with test environment
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-for-internal-api-tests",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo",
        MIMO_INTERNAL_VCS_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    // Create mock filesystem structure
    mockOS.fs.seed({
      "/tmp/test-mimo": null,
      "/tmp/test-mimo/users": null,
      "/tmp/test-mimo/projects": null,
      "/tmp/test-mimo/agents": null,
      "/tmp/test-mimo/mcp-servers": null,
      "/tmp/test-mimo/session-repos": null,
    });

    // Create MimoContext with mock OS
    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-internal-api-tests",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo",
        MIMO_VCS_REPOS_DIR: "/tmp/test-mimo/session-repos",
        MIMO_INTERNAL_VCS_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    // Generate a valid JWT token for testing
    validToken = await mimoContext.services.auth.generateToken("testuser");

    // Create app with internal API router mounted
    app = new Hono();
    app.route("/api/internal", createInternalApiRouter(mimoContext));
  });

  describe("Health Check Endpoint", () => {
    it("should return healthy status with valid token", async () => {
      const req = new Request("http://localhost:3000/api/internal/health", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("healthy");
      expect(json.data.timestamp).toBeDefined();
    });

    it("should reject requests without Authorization header", async () => {
      const req = new Request("http://localhost:3000/api/internal/health");

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Missing Authorization header");
      expect(json.code).toBe(401);
    });

    it("should reject requests with a malformed Bearer header (Bearer with no token)", async () => {
      // A header that starts with "Bearer" but has no token is a clear
      // client mistake and is surfaced as the explicit format error.
      const req = new Request("http://localhost:3000/api/internal/health", {
        headers: {
          Authorization: "Bearer ",
        },
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid Authorization header format");
      expect(json.code).toBe(401);
    });

    it("falls back to cookie auth when Authorization uses a non-Bearer scheme", async () => {
      // Reverse proxies (e.g. Cloudflare) and browser extensions can attach
      // their own Authorization headers. Same-origin browser fetches still
      // rely on the HttpOnly `token` cookie, so a non-Bearer header must
      // not block cookie-based auth.
      const req = new Request("http://localhost:3000/api/internal/health", {
        headers: {
          Authorization: "InvalidFormat token123",
          Cookie: `token=${validToken}`,
        },
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should reject requests with expired/invalid token", async () => {
      const req = new Request("http://localhost:3000/api/internal/health", {
        headers: {
          Authorization: "Bearer invalid-token-12345",
        },
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid or expired token");
      expect(json.code).toBe(401);
    });
  });

  describe("Response Format", () => {
    it("should return standardized success response", async () => {
      const req = new Request("http://localhost:3000/api/internal/health", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      const res = await app.fetch(req);
      const json = await res.json();

      // Verify standardized response format
      expect(json).toHaveProperty("success");
      expect(json).toHaveProperty("data");
      expect(json.success).toBe(true);
      expect(typeof json.data).toBe("object");
    });

    it("should return standardized error response", async () => {
      const req = new Request("http://localhost:3000/api/internal/health");

      const res = await app.fetch(req);
      const json = await res.json();

      // Verify standardized error format
      expect(json).toHaveProperty("success");
      expect(json).toHaveProperty("error");
      expect(json).toHaveProperty("code");
      expect(json.success).toBe(false);
      expect(typeof json.error).toBe("string");
      expect(typeof json.code).toBe("number");
    });
  });

  describe("Router Mounting", () => {
    it("should be accessible at /api/internal/health", async () => {
      const req = new Request("http://localhost:3000/api/internal/health", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
    });

    it("should return 404 for unknown internal API routes", async () => {
      const req = new Request("http://localhost:3000/api/internal/unknown", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(404);
    });
  });

  describe("MimoContext Injection", () => {
    it("should make MimoContext available in context", async () => {
      // The health check endpoint runs successfully, which means
      // the MimoContext was properly injected and accessible
      const req = new Request("http://localhost:3000/api/internal/health", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
    });
  });
});
