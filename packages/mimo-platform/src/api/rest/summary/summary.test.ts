// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for the summary internal API.
 *
 * These tests verify that the summary internal API endpoints:
 * - Require authentication
 * - Validate required parameters
 * - Return appropriate error codes
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "../index.js";
import { createMimoContext } from "../../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../../infrastructure/os/mock-adapter.js";

describe("Summary Internal API", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let mockOS: MockOS;
  let validToken: string;

  beforeAll(async () => {
    // Set up mock OS with test environment
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-for-summary-api-tests",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-summary",
        MIMO_SHARED_FOSSIL_SERVER_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    // Create mock filesystem structure
    mockOS.fs.seed({
      "/tmp/test-mimo-summary": null,
      "/tmp/test-mimo-summary/users": null,
      "/tmp/test-mimo-summary/projects": null,
      "/tmp/test-mimo-summary/agents": null,
      "/tmp/test-mimo-summary/mcp-servers": null,
      "/tmp/test-mimo-summary/session-fossils": null,
    });

    // Create MimoContext with mock OS
    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-summary-api-tests",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo-summary",
        FOSSIL_REPOS_DIR: "/tmp/test-mimo-summary/session-fossils",
        MIMO_SHARED_FOSSIL_SERVER_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    // Create test user and generate token
    await mimoContext.repos.users.create("testuser", "password123");
    validToken = await mimoContext.services.auth.generateToken("testuser");

    // Create app with internal API router mounted
    app = new Hono();
    app.route("/api/internal", createInternalApiRouter(mimoContext));
  });

  describe("POST /api/internal/summary/refresh", () => {
    it("should return 401 when not authenticated", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/summary/refresh",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: "test-session",
            analyzeThreadId: "thread-1",
            summarizeThreadId: "thread-2",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 400 when sessionId is missing", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/summary/refresh",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${validToken}`,
          },
          body: JSON.stringify({
            analyzeThreadId: "thread-1",
            summarizeThreadId: "thread-2",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("sessionId is required");
    });

    it("should return 400 when analyzeThreadId is missing", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/summary/refresh",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${validToken}`,
          },
          body: JSON.stringify({
            sessionId: "test-session",
            summarizeThreadId: "thread-2",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("analyzeThreadId is required");
    });

    it("should return 400 when summarizeThreadId is missing", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/summary/refresh",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${validToken}`,
          },
          body: JSON.stringify({
            sessionId: "test-session",
            analyzeThreadId: "thread-1",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("summarizeThreadId is required");
    });

    it("should return 404 when session does not exist", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/summary/refresh",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${validToken}`,
          },
          body: JSON.stringify({
            sessionId: "nonexistent-session",
            analyzeThreadId: "thread-1",
            summarizeThreadId: "thread-2",
          }),
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Session not found");
    });
  });

  describe("GET /api/internal/summary/latest", () => {
    it("should return 401 when not authenticated", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/summary/latest?sessionId=test-session&summarizeThreadId=thread-2",
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.success).toBe(false);
    });

    it("should return 400 when sessionId is missing", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/summary/latest?summarizeThreadId=thread-2",
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("sessionId is required");
    });

    it("should return 400 when summarizeThreadId is missing", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/summary/latest?sessionId=test-session",
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("summarizeThreadId is required");
    });

    it("should return 404 when session does not exist", async () => {
      const req = new Request(
        "http://localhost:3000/api/internal/summary/latest?sessionId=nonexistent-session&summarizeThreadId=thread-2",
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Session not found");
    });

    it("should return empty summary when no messages exist", async () => {
      // Create a session first
      const session = await mimoContext.repos.sessions.create({
        name: "Test Session",
        projectId: "test-project",
        owner: "testuser",
      });

      // Add a chat thread to the session
      await mimoContext.repos.sessions.addChatThread(session.id, {
        name: "Test Thread",
        model: "default",
        mode: "default",
      });

      // Get the updated session to get the thread ID
      const updatedSession = await mimoContext.repos.sessions.findById(
        session.id,
      );
      const threadId = updatedSession?.chatThreads[0]?.id || "thread-1";

      const req = new Request(
        `http://localhost:3000/api/internal/summary/latest?sessionId=${session.id}&summarizeThreadId=${threadId}`,
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        },
      );

      const res = await app.fetch(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.summary).toBe("");
    });
  });
});
