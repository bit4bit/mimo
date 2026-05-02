/**
 * Tests for the Internal API Client.
 *
 * These tests verify that the client:
 * - Automatically extracts tokens from cookies
 * - Makes HTTP requests with proper headers
 * - Handles success and error responses
 * - Provides type-safe generic responses
 * - Handles network and JSON parse errors
 */

import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { Context } from "hono";
import {
  createInternalApiClient,
  type ApiResult,
} from "./client.js";
import { createMimoContext } from "../../../context/mimo-context.js";
import { createMockOS } from "../../../os/mock-adapter.js";
import type { MockOS } from "../../../os/mock-adapter.js";

// Helper to create a mock Hono context with headers
function createMockContext(headers: Record<string, string>): Context {
  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()] || undefined,
    },
  } as unknown as Context;
}

describe("createInternalApiClient", () => {
  let mockOS: MockOS;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Set up mock OS with test environment
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret",
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
    });

    // Create MimoContext with mock OS
    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo",
        FOSSIL_REPOS_DIR: "/tmp/test-mimo/fossils",
        MIMO_SHARED_FOSSIL_SERVER_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });
  });

  describe("successful GET request", () => {
    it("should make GET request and return typed data", async () => {
      // Mock successful response
      const mockData = { id: "123", name: "Test Session" };
      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: mockData }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      // Create mock context with token cookie
      const c = createMockContext({ cookie: "token=valid-jwt-token" });

      // Create client and make request
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.get<typeof mockData>("/sessions/123");

      // Verify success
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockData);
        expect(result.status).toBe(200);
      }

      // Verify fetch was called with correct arguments
      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      expect(fetchCall).toBeDefined();
      if (fetchCall) {
        expect(fetchCall[0]).toBe("http://localhost:3000/api/internal/sessions/123");
        expect(fetchCall[1]).toMatchObject({
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer valid-jwt-token",
          },
        });
      }

      fetchSpy.mockRestore();
    });
  });

  describe("successful POST request", () => {
    it("should POST JSON body with Content-Type header", async () => {
      const requestBody = { name: "New Session", projectId: "456" };
      const responseData = { id: "789", name: "New Session", projectId: "456" };

      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: responseData }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const c = createMockContext({ cookie: "token=valid-jwt-token" });
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.post<typeof responseData>("/sessions", requestBody);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(responseData);
        expect(result.status).toBe(201);
      }

      // Verify POST was made with body and Content-Type
      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      expect(fetchCall).toBeDefined();
      if (fetchCall) {
        expect(fetchCall[0]).toBe("http://localhost:3000/api/internal/sessions");
        expect(fetchCall[1]).toMatchObject({
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer valid-jwt-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });
      }

      fetchSpy.mockRestore();
    });
  });

  describe("successful PUT request", () => {
    it("should PUT JSON body with Content-Type header", async () => {
      const requestBody = { name: "Updated Session" };
      const responseData = { id: "123", name: "Updated Session" };

      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: responseData }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const c = createMockContext({ cookie: "token=valid-jwt-token" });
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.put<typeof responseData>("/sessions/123", requestBody);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(responseData);
      }

      // Verify PUT was made with correct method
      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      if (fetchCall) {
        expect(fetchCall[1]).toMatchObject({
          method: "PUT",
        });
      }

      fetchSpy.mockRestore();
    });
  });

  describe("successful DELETE request", () => {
    it("should make DELETE request without body", async () => {
      const responseData = { deleted: true };

      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: responseData }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const c = createMockContext({ cookie: "token=valid-jwt-token" });
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.delete<typeof responseData>("/sessions/123");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(responseData);
      }

      // Verify DELETE was made with correct method and no body
      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      if (fetchCall) {
        expect(fetchCall[1]).toMatchObject({
          method: "DELETE",
        });
        expect(fetchCall[1].body).toBeUndefined();
      }

      fetchSpy.mockRestore();
    });
  });

  describe("401 response when token missing", () => {
    it("should return error without making HTTP request", async () => {
      fetchSpy = spyOn(global, "fetch");

      const c = createMockContext({}); // No cookie header
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.get<unknown>("/sessions");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Unauthorized");
        expect(result.status).toBe(401);
      }

      // Verify fetch was NOT called
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });
  });

  describe("404 response from internal API", () => {
    it("should return error with 404 status", async () => {
      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: false, error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const c = createMockContext({ cookie: "token=valid-jwt-token" });
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.get<unknown>("/sessions/999");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Not found");
        expect(result.status).toBe(404);
      }

      fetchSpy.mockRestore();
    });
  });

  describe("network error handling", () => {
    it("should return error with 500 status on network failure", async () => {
      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.reject(new Error("Connection refused")),
      );

      const c = createMockContext({ cookie: "token=valid-jwt-token" });
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.get<unknown>("/sessions");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Connection refused");
        expect(result.status).toBe(500);
      }

      fetchSpy.mockRestore();
    });
  });

  describe("JSON parse error handling", () => {
    it("should return error when response is not valid JSON", async () => {
      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response("not valid json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const c = createMockContext({ cookie: "token=valid-jwt-token" });
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.get<unknown>("/sessions");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid JSON response");
      }

      fetchSpy.mockRestore();
    });
  });

  describe("type safety with generic parameters", () => {
    it("should enforce type safety for response data", async () => {
      interface SessionResponse {
        id: string;
        name: string;
        projectId: string;
      }

      const mockData: SessionResponse = {
        id: "123",
        name: "Test Session",
        projectId: "456",
      };

      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: mockData }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const c = createMockContext({ cookie: "token=valid-jwt-token" });
      const client = createInternalApiClient(c, mimoContext);

      // Type parameter should enforce SessionResponse type
      const result: ApiResult<SessionResponse> = await client.get<SessionResponse>(
        "/sessions/123",
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // TypeScript should know result.data is SessionResponse
        expect(result.data.id).toBe("123");
        expect(result.data.name).toBe("Test Session");
        expect(result.data.projectId).toBe("456");
      }

      fetchSpy.mockRestore();
    });

    it("should work with array types", async () => {
      interface Session {
        id: string;
        name: string;
      }

      const mockData: Session[] = [
        { id: "1", name: "Session 1" },
        { id: "2", name: "Session 2" },
      ];

      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: mockData }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const c = createMockContext({ cookie: "token=valid-jwt-token" });
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.get<Session[]>("/sessions");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBe("Session 1");
      }

      fetchSpy.mockRestore();
    });
  });

  describe("HTTP error handling", () => {
    it("should handle non-2xx HTTP responses", async () => {
      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response("Internal Server Error", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          }),
        ),
      );

      const c = createMockContext({ cookie: "token=valid-jwt-token" });
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.get<unknown>("/sessions");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(500);
      }

      fetchSpy.mockRestore();
    });
  });

  describe("raw data extraction", () => {
    it("should handle responses without success wrapper", async () => {
      // Some endpoints might return raw data without { success: true, data: ... } wrapper
      const mockData = { message: "pong" };

      fetchSpy = spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const c = createMockContext({ cookie: "token=valid-jwt-token" });
      const client = createInternalApiClient(c, mimoContext);
      const result = await client.get<typeof mockData>("/health");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockData);
      }

      fetchSpy.mockRestore();
    });
  });
});
