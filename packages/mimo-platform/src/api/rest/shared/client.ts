/**
 * Internal API client abstraction for web routes.
 *
 * Provides a simplified interface for calling internal API endpoints
 * with automatic token handling and standardized responses.
 */

import type { Context } from "hono";
import type { MimoContext } from "../../../infrastructure/context/mimo-context.js";
import { extractTokenFromCookie } from "./token.js";

/**
 * Success response type from the API client.
 */
export interface ApiSuccessResult<T> {
  success: true;
  data: T;
  status: number;
}

/**
 * Error response type from the API client.
 */
export interface ApiErrorResult {
  success: false;
  error: string;
  status: number;
}

/**
 * Union type for API client responses.
 */
export type ApiResult<T> = ApiSuccessResult<T> | ApiErrorResult;

/**
 * Options for creating the internal API client.
 */
export interface InternalApiClientOptions {
  /**
   * Optional custom fetch function for testing.
   * If not provided, uses global fetch.
   */
  fetchFn?: typeof fetch;
}

/**
 * Internal API client interface.
 */
export interface InternalApiClient {
  /**
   * Makes a GET request to the internal API.
   *
   * @param path - The API endpoint path (e.g., "/sessions")
   * @returns Promise resolving to ApiResult with typed data
   */
  get<T>(path: string): Promise<ApiResult<T>>;

  /**
   * Makes a POST request to the internal API.
   *
   * @param path - The API endpoint path (e.g., "/sessions")
   * @param body - The request body to send as JSON
   * @returns Promise resolving to ApiResult with typed data
   */
  post<T>(path: string, body: unknown): Promise<ApiResult<T>>;

  /**
   * Makes a PUT request to the internal API.
   *
   * @param path - The API endpoint path (e.g., "/sessions/123")
   * @param body - The request body to send as JSON
   * @returns Promise resolving to ApiResult with typed data
   */
  put<T>(path: string, body: unknown): Promise<ApiResult<T>>;

  /**
   * Makes a DELETE request to the internal API.
   *
   * @param path - The API endpoint path (e.g., "/sessions/123")
   * @returns Promise resolving to ApiResult with typed data
   */
  delete<T>(path: string): Promise<ApiResult<T>>;
}

/**
 * Creates an Internal API client bound to the current request context.
 *
 * This factory function creates a client that automatically:
 * - Extracts JWT tokens from cookies
 * - Adds Authorization headers
 * - Handles JSON serialization
 * - Provides consistent error handling
 *
 * @param c - The Hono request context
 * @param mimoContext - The MimoContext containing configuration
 * @param options - Optional client configuration
 * @returns An InternalApiClient instance
 *
 * @example
 * ```typescript
 * const apiClient = createInternalApiClient(c, mimoContext);
 * const result = await apiClient.get<Session[]>('/sessions');
 * if (!result.success) {
 *   return c.html(<ErrorPage error={result.error} />, result.status);
 * }
 * return c.html(<SessionsList sessions={result.data} />);
 * ```
 *
 * @example
 * // With custom fetch for testing:
 * const apiClient = createInternalApiClient(c, mimoContext, {
 *   fetchFn: app.fetch.bind(app) // Use Hono app's fetch
 * });
 * ```
 */
export function createInternalApiClient(
  c: Context,
  mimoContext: MimoContext,
  options?: InternalApiClientOptions,
): InternalApiClient {
  const platformUrl = mimoContext.env.PLATFORM_URL;
  const fetchFn = options?.fetchFn ?? fetch;

  /**
   * Core request function that handles all HTTP methods.
   *
   * @param method - HTTP method (GET, POST, PUT, DELETE)
   * @param path - API endpoint path
   * @param body - Optional request body
   * @returns Typed API result
   */
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    // Extract token from cookie
    const token = extractTokenFromCookie(c);

    // Return 401 if no token present
    if (!token) {
      return {
        success: false,
        error: "Unauthorized",
        status: 401,
      };
    }

    // Build headers
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };

    // Add Content-Type for requests with body
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    try {
      // Make the HTTP request
      const response = await fetchFn(`${platformUrl}/api/internal${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      // Parse JSON response
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        return {
          success: false,
          error: "Invalid JSON response",
          status: response.status,
        };
      }

      // Check for API error response format
      if (
        typeof data === "object" &&
        data !== null &&
        "success" in data &&
        data.success === false
      ) {
        return {
          success: false,
          error:
            typeof data.error === "string"
              ? data.error
              : `HTTP ${response.status}`,
          status: response.status,
        };
      }

      // Check HTTP status
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}`,
          status: response.status,
        };
      }

      // Extract data from success response
      const responseData =
        typeof data === "object" &&
        data !== null &&
        "data" in data &&
        data.success === true
          ? (data as { data: T }).data
          : (data as T);

      return {
        success: true,
        data: responseData,
        status: response.status,
      };
    } catch (error) {
      // Handle network errors
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
        status: 500,
      };
    }
  }

  // Return client with HTTP method wrappers
  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
    put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
    delete: <T>(path: string) => request<T>("DELETE", path),
  };
}
