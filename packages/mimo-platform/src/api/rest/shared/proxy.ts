// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shared proxy helper utilities for internal API calls.
 *
 * Provides standardized HTTP fetch patterns for web routes to call
 * internal API endpoints. Encapsulates common patterns like token
 * extraction, error handling, and response parsing.
 */

import type { Context } from "hono";
import { extractTokenFromCookie } from "./token.js";

/**
 * Configuration for internal API proxy requests.
 */
export interface ProxyConfig {
  /** Base URL of the platform (e.g., http://localhost:3000) */
  platformUrl: string;
}

/**
 * Standard error response from internal API.
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
}

/**
 * Standard success response from internal API.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Makes an HTTP request to an internal API endpoint.
 *
 * This is the standard pattern for web routes to call internal APIs.
 * Automatically extracts the JWT token from cookies and includes it
 * in the Authorization header.
 *
 * @param c - The Hono context
 * @param config - Proxy configuration with platform URL
 * @param endpoint - The internal API endpoint path (e.g., "/api/internal/projects")
 * @param options - Fetch options (method, body, etc.)
 * @returns The fetch Response object
 *
 * @example
 * ```typescript
 * const response = await fetchInternalApi(
 *   c,
 *   { platformUrl: mimoContext.env.PLATFORM_URL },
 *   "/api/internal/projects",
 *   { method: "GET" }
 * );
 * ```
 */
export async function fetchInternalApi(
  c: Context,
  config: ProxyConfig,
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = extractTokenFromCookie(c);

  if (!token) {
    // Return a synthetic 401 response
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((options.headers as Record<string, string>) || {}),
  };

  // Add Content-Type for JSON bodies
  if (
    options.body &&
    typeof options.body === "string" &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(`${config.platformUrl}${endpoint}`, {
    ...options,
    headers,
  });
}

/**
 * Parses a successful JSON response from internal API.
 *
 * Type-safe helper for parsing JSON responses with data.
 *
 * @param response - The fetch Response object
 * @returns The parsed data
 * @throws Error if response is not OK or parsing fails
 *
 * @example
 * ```typescript
 * const data = await parseApiResponse<Project[]>(response);
 * ```
 */
export async function parseApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`API request failed: ${errorText}`);
  }

  const result = (await response.json()) as
    | ApiSuccessResponse<T>
    | ApiErrorResponse;

  if (!result.success) {
    throw new Error((result as ApiErrorResponse).error);
  }

  return (result as ApiSuccessResponse<T>).data;
}

/**
 * Gets the HTTP status code to use when rendering an error page.
 *
 * Maps response status codes to appropriate error page statuses.
 *
 * @param response - The fetch Response object
 * @returns The HTTP status code
 */
export function getErrorStatusCode(response: Response): number {
  if (response.status === 404) return 404;
  if (response.status === 401) return 401;
  if (response.status === 403) return 403;
  if (response.status === 400) return 400;
  return 500;
}

/**
 * Extracts error message from an API error response.
 *
 * Safely extracts the error message from various response formats.
 *
 * @param response - The fetch Response object
 * @param fallback - Fallback message if extraction fails
 * @returns The error message string
 */
export async function extractErrorMessage(
  response: Response,
  fallback: string = "An error occurred",
): Promise<string> {
  try {
    const result = await response.json();
    if (typeof result === "object" && result && "error" in result) {
      return String(result.error);
    }
  } catch {
    // Fall through to text extraction
  }

  const text = await response.text().catch(() => fallback);
  return text || fallback;
}
