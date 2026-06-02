// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for the auth internal API.
 *
 * These tests verify that the auth internal API endpoints:
 * - Do NOT require authentication for register/login/verify
 * - Return standardized JSON responses
 * - Perform authentication operations correctly
 * - Handle errors appropriately
 */

import { describe, it, expect, beforeAll, mock } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "../index.js";
import { createMimoContext } from "../../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../../infrastructure/os/mock-adapter.js";

describe("Auth Internal API", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let mockOS: MockOS;
  let validToken: string;

  beforeAll(async () => {
    // Set up mock OS with test environment
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-for-auth-api-tests",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-auth",
        MIMO_SHARED_FOSSIL_SERVER_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    // Create mock filesystem structure
    mockOS.fs.seed({
      "/tmp/test-mimo-auth": null,
      "/tmp/test-mimo-auth/users": null,
      "/tmp/test-mimo-auth/projects": null,
      "/tmp/test-mimo-auth/agents": null,
      "/tmp/test-mimo-auth/mcp-servers": null,
      "/tmp/test-mimo-auth/session-fossils": null,
    });

    // Create MimoContext with mock OS
    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-auth-api-tests",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        PLATFORM_V2_URL: "http://platform-v2:8890",
        MIMO_HOME: "/tmp/test-mimo-auth",
        FOSSIL_REPOS_DIR: "/tmp/test-mimo-auth/session-fossils",
        MIMO_SHARED_FOSSIL_SERVER_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    // Generate token for testing
    validToken = await mimoContext.services.auth.generateToken("testuser");

    // Create app with internal API router mounted
    app = new Hono();
    app.route("/api/internal", createInternalApiRouter(mimoContext));
  });

  describe("Register", () => {
    it("should register a new user successfully", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: "newuser",
            password: "password123",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.user.username).toBe("newuser");
      expect(json.data.user.createdAt).toBeDefined();
    });

    it("should return 400 when username is missing", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password: "password123",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Username and password required");
    });

    it("should return 400 when password is missing", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: "newuser2",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Username and password required");
    });

    it("should return 409 when username already exists", async () => {
      // First registration
      await mimoContext.repos.users.create("existinguser", "hashedpassword");

      // Duplicate registration
      const req = new Request(
        "http://localhost:3000/api/internal/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: "existinguser",
            password: "password123",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Username already exists");
    });
  });

  describe("Login", () => {
    it("should proxy login with valid credentials to platform v2", async () => {
      const fetchFn = mock(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            data: { token: "v2-token", username: "logintestuser" },
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

      const req = new Request("http://localhost:3000/api/internal/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "logintestuser",
          password: "testpass",
        }),
      });

      const res = await proxiedApp.fetch(req);
      const json = await res.json();

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: { token: "v2-token", username: "logintestuser" },
      });
    });

    it("should pass through v2 validation errors", async () => {
      const fetchFn = mock(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Username and password required",
            code: 400,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      });

      const proxiedApp = new Hono();
      proxiedApp.route(
        "/api/internal",
        createInternalApiRouter(mimoContext, { fetchFn }),
      );

      const req = new Request("http://localhost:3000/api/internal/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: "password123",
        }),
      });

      const res = await proxiedApp.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json).toEqual({
        success: false,
        error: "Username and password required",
        code: 400,
      });
    });

    it("should pass through v2 invalid credential responses", async () => {
      const fetchFn = mock(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: "invalid credentials",
            code: 401,
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

      const req = new Request("http://localhost:3000/api/internal/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "passcheckuser",
          password: "wrongpass",
        }),
      });

      const res = await proxiedApp.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        success: false,
        error: "invalid credentials",
        code: 401,
      });
    });
  });

  describe("Logout", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/auth/logout",
        {
          method: "POST",
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Unauthorized");
    });

    it("should logout successfully with valid token", async () => {
      // Create user and login first
      const passwordHash = await Bun.password.hash("testpass", {
        algorithm: "bcrypt",
        cost: 10,
      });
      await mimoContext.repos.users.create("logoutuser", passwordHash);
      const token = await mimoContext.services.auth.generateToken("logoutuser");

      const req = new Request(
        "http://localhost:3000/api/internal/auth/logout",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.success).toBe(true);
    });
  });

  describe("Verify", () => {
    it("should return valid=false when no token provided", async () => {
      const req = new Request("http://localhost:3000/api/internal/auth/verify");

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.valid).toBe(false);
    });

    it("should return valid=false for invalid token", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/auth/verify",
        {
          headers: {
            Authorization: "Bearer invalid-token",
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.valid).toBe(false);
    });

    it("should return valid=true with user info for valid token", async () => {
      // Create user and generate token
      const passwordHash = await Bun.password.hash("testpass", {
        algorithm: "bcrypt",
        cost: 10,
      });
      await mimoContext.repos.users.create("verifyuser", passwordHash);
      const token = await mimoContext.services.auth.generateToken("verifyuser");

      const req = new Request(
        "http://localhost:3000/api/internal/auth/verify",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.valid).toBe(true);
      expect(json.data.user.username).toBe("verifyuser");
      expect(json.data.user.exp).toBeDefined();
    });
  });

  describe("No Authentication Required", () => {
    it("register should not require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: "noshouldreguser",
            password: "password123",
          }),
        },
      );

      const res = await app.fetch(req);

      // Should succeed, not require auth
      expect(res.status).toBe(201);
    });

    it("login should not require authentication", async () => {
      const fetchFn = mock(async (_url: string, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("authorization")).toBeNull();

        return new Response(
          JSON.stringify({
            success: true,
            data: { token: "v2-token", username: "nosessionuser" },
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

      const req = new Request("http://localhost:3000/api/internal/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "nosessionuser",
          password: "testpass",
        }),
      });

      const res = await proxiedApp.fetch(req);

      // Should succeed, not require auth
      expect(res.status).toBe(200);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("verify should not require authentication (just validates token)", async () => {
      const req = new Request("http://localhost:3000/api/internal/auth/verify");

      const res = await app.fetch(req);

      // Should succeed, not require auth
      expect(res.status).toBe(200);
    });
  });
});
