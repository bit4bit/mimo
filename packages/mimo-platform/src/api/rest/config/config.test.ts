/**
 * Integration tests for the config internal API.
 *
 * These tests verify that the config internal API endpoints:
 * - Require authentication
 * - Return standardized JSON responses
 * - Perform get/update/reset operations correctly
 * - Validate configuration before saving
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "../index.js";
import { createMimoContext } from "../../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../../infrastructure/os/mock-adapter.js";

describe("Config Internal API", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let mockOS: MockOS;
  let validToken: string;

  beforeAll(async () => {
    // Set up mock OS with test environment
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-for-config-api-tests",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-config",
        MIMO_SHARED_FOSSIL_SERVER_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    // Create mock filesystem structure
    mockOS.fs.seed({
      "/tmp/test-mimo-config": null,
      "/tmp/test-mimo-config/users": null,
      "/tmp/test-mimo-config/projects": null,
      "/tmp/test-mimo-config/agents": null,
      "/tmp/test-mimo-config/mcp-servers": null,
      "/tmp/test-mimo-config/session-fossils": null,
    });

    // Create MimoContext with mock OS
    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-config-api-tests",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo-config",
        FOSSIL_REPOS_DIR: "/tmp/test-mimo-config/session-fossils",
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

  describe("Get Config", () => {
    it("should require authentication", async () => {
      const req = new Request("http://localhost:3000/api/internal/config");
      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Missing Authorization header");
    });

    it("should return current configuration", async () => {
      const req = new Request("http://localhost:3000/api/internal/config", {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("config");
      expect(json.data.config).toHaveProperty("theme");
      expect(json.data.config).toHaveProperty("fontSize");
      expect(json.data.config).toHaveProperty("fontFamily");
      expect(json.data.config).toHaveProperty("sessionKeybindings");
    });
  });

  describe("Update Config", () => {
    it("should require authentication", async () => {
      const req = new Request("http://localhost:3000/api/internal/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme: "dark",
          fontSize: 14,
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Missing Authorization header");
    });

    it("should update configuration with valid values", async () => {
      const req = new Request("http://localhost:3000/api/internal/config", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme: "light",
          fontSize: 16,
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.config.theme).toBe("light");
      expect(json.data.config.fontSize).toBe(16);
    });

    it("should reject invalid configuration values", async () => {
      const req = new Request("http://localhost:3000/api/internal/config", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme: "invalid-theme",
          fontSize: 5, // Too small
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Validation failed");
    });

    it("should preserve existing values not sent in request", async () => {
      // First set a value
      await app.fetch(
        new Request("http://localhost:3000/api/internal/config", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fontFamily: "monospace",
          }),
        }),
      );

      // Then update only theme
      const req = new Request("http://localhost:3000/api/internal/config", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme: "dark",
        }),
      });

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.config.theme).toBe("dark");
      // fontFamily should be preserved
      expect(json.data.config.fontFamily).toBe("monospace");
    });
  });

  describe("Reset Config", () => {
    it("should require authentication", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/config/reset",
        {
          method: "POST",
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Missing Authorization header");
    });

    it("should reset configuration to defaults", async () => {
      // First change some config
      await app.fetch(
        new Request("http://localhost:3000/api/internal/config", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            theme: "light",
            fontSize: 20,
          }),
        }),
      );

      // Then reset
      const req = new Request(
        "http://localhost:3000/api/internal/config/reset",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.config.theme).toBe("dark");
      expect(json.data.config.fontSize).toBe(14);
    });
  });
});
