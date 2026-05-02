/**
 * Test utilities for mocking the Internal API Client's fetch calls.
 *
 * These helpers allow tests to mock HTTP responses from the internal API
 * when using the createInternalApiClient pattern.
 */

import { spyOn } from "bun:test";

export interface MockResponse {
  status: number;
  data?: unknown;
  error?: string;
}

/**
 * Creates a mock fetch implementation for internal API calls.
 *
 * @param baseUrl - The base URL of the platform (e.g., "http://localhost:3000")
 * @param handlers - Map of endpoint paths to mock responses
 * @returns A mock fetch function and a spy for assertions
 *
 * @example
 * ```typescript
 * const mockFetch = createMockInternalApiFetch("http://localhost:3000", {
 *   "/api/internal/agents": { status: 200, data: { agents: [] } },
 *   "/api/internal/agents/123": { status: 404, error: "Not found" },
 * });
 *
 * const fetchSpy = spyOn(global, "fetch").mockImplementation(mockFetch);
 * // ... run test ...
 * fetchSpy.mockRestore();
 * ```
 */
export function createMockInternalApiFetch(
  baseUrl: string,
  handlers: Record<string, MockResponse>,
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input, init): Promise<Response> => {
    const url = input.toString();
    const method = init?.method || "GET";

    // Only handle internal API calls
    if (!url.startsWith(`${baseUrl}/api/internal`)) {
      throw new Error(`Unexpected fetch call to non-internal API: ${url}`);
    }

    // Extract the path after /api/internal
    const path = url.replace(`${baseUrl}/api/internal`, "");
    const handler = handlers[path];

    if (!handler) {
      // Return 404 if no handler defined
      return new Response(
        JSON.stringify({ success: false, error: "Not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Return success or error response based on handler
    if (handler.status >= 200 && handler.status < 300 && handler.data) {
      return new Response(
        JSON.stringify({ success: true, data: handler.data }),
        {
          status: handler.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: handler.error || `HTTP ${handler.status}`,
        }),
        {
          status: handler.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  };
}

/**
 * Helper to set up fetch mocking for a test suite.
 *
 * @param baseUrl - The base URL of the platform
 * @returns Object with setHandlers and cleanup functions
 *
 * @example
 * ```typescript
 * const mockApi = setupInternalApiMock("http://localhost:3000");
 *
 * beforeEach(() => {
 *   mockApi.setHandlers({
 *     "/agents": { status: 200, data: { agents: [] } },
 *   });
 * });
 *
 * afterEach(() => {
 *   mockApi.cleanup();
 * });
 * ```
 */
export function setupInternalApiMock(baseUrl: string) {
  let currentHandlers: Record<string, MockResponse> = {};
  let fetchSpy: ReturnType<typeof spyOn> | null = null;

  const mockFetch = createMockInternalApiFetch(baseUrl, {});

  return {
    setHandlers: (handlers: Record<string, MockResponse>) => {
      currentHandlers = handlers;

      // Create new mock function with current handlers
      const fetchWithHandlers = createMockInternalApiFetch(
        baseUrl,
        currentHandlers,
      );

      // Set up spy if not already done
      if (!fetchSpy) {
        fetchSpy = spyOn(global, "fetch").mockImplementation(fetchWithHandlers);
      } else {
        // Update the mock implementation
        fetchSpy.mockImplementation(fetchWithHandlers);
      }
    },

    cleanup: () => {
      if (fetchSpy) {
        fetchSpy.mockRestore();
        fetchSpy = null;
      }
      currentHandlers = {};
    },

    getFetchSpy: () => fetchSpy,
  };
}
