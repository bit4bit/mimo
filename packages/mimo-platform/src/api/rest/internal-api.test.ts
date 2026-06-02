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

import { describe, it, expect, beforeAll, mock } from "bun:test";
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
        MIMO_SHARED_FOSSIL_SERVER_PORT: "8000",
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
      "/tmp/test-mimo/session-fossils": null,
    });

    // Create MimoContext with mock OS
    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-internal-api-tests",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        PLATFORM_V2_URL: "http://platform-v2:8890",
        MIMO_HOME: "/tmp/test-mimo",
        FOSSIL_REPOS_DIR: "/tmp/test-mimo/session-fossils",
        MIMO_SHARED_FOSSIL_SERVER_PORT: 8000,
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

    it("should reject requests with invalid token format", async () => {
      const req = new Request("http://localhost:3000/api/internal/health", {
        headers: {
          Authorization: "InvalidFormat token123",
        },
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid Authorization header format");
      expect(json.code).toBe(401);
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

  describe("v2 Migration Gateway", () => {
    it("proxies manifest-owned internal API routes to platform v2", async () => {
      const fetchFn = mock(async (url: string, init?: RequestInit) => {
        const forwardedBody = await new Response(init?.body as BodyInit).text();

        expect(url).toBe(
          "http://platform-v2:8890/api/internal/auth/login?source=test",
        );
        expect(init?.method).toBe("POST");
        expect(forwardedBody).toBe(
          JSON.stringify({ username: "jova", password: "localhost" }),
        );
        expect(new Headers(init?.headers).get("content-type")).toBe(
          "application/json",
        );

        return new Response(
          JSON.stringify({
            success: true,
            data: { token: "v2-token", username: "jova" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      });

      const proxiedApp = new Hono();
      proxiedApp.route(
        "/api/internal",
        createInternalApiRouter(mimoContext, { fetchFn }),
      );

      const req = new Request(
        "http://localhost:3000/api/internal/auth/login?source=test",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "jova", password: "localhost" }),
        },
      );

      const res = await proxiedApp.fetch(req);
      const json = await res.json();

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: { token: "v2-token", username: "jova" },
      });
    });

    it("does not proxy routes outside the migration manifest", async () => {
      const fetchFn = mock(async () => {
        throw new Error("unexpected proxy call");
      });

      const proxiedApp = new Hono();
      proxiedApp.route(
        "/api/internal",
        createInternalApiRouter(mimoContext, { fetchFn }),
      );

      const req = new Request("http://localhost:3000/api/internal/health", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      const res = await proxiedApp.fetch(req);
      const json = await res.json();

      expect(fetchFn).not.toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("does not proxy different methods for a migrated path", async () => {
      const fetchFn = mock(async () => {
        throw new Error("unexpected proxy call");
      });

      const proxiedApp = new Hono();
      proxiedApp.route(
        "/api/internal",
        createInternalApiRouter(mimoContext, { fetchFn }),
      );

      const req = new Request("http://localhost:3000/api/internal/auth/login", {
        method: "GET",
      });

      const res = await proxiedApp.fetch(req);

      expect(fetchFn).not.toHaveBeenCalled();
      expect(res.status).toBe(401);
    });

    it("fails closed when platform v2 is unavailable", async () => {
      const fetchFn = mock(async () => {
        throw new Error("connect ECONNREFUSED");
      });

      const proxiedApp = new Hono();
      proxiedApp.route(
        "/api/internal",
        createInternalApiRouter(mimoContext, { fetchFn }),
      );

      const req = new Request("http://localhost:3000/api/internal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "jova", password: "localhost" }),
      });

      const res = await proxiedApp.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json).toEqual({
        success: false,
        error: "Authentication service unavailable",
        code: 503,
      });
    });
  });
});
