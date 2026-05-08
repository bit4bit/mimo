// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shared token extraction utility for internal API proxy pattern.
 *
 * Provides functions for extracting JWT tokens from HTTP request cookies.
 */

import type { Context } from "hono";

/**
 * Extracts the JWT token from the request's Cookie header.
 *
 * Parses the Cookie header and extracts the value of the 'token' cookie.
 * Returns null if the token cookie is not present.
 *
 * @param c - The Hono context containing the request
 * @returns The JWT token string or null if not found
 *
 * @example
 * ```typescript
 * const token = extractTokenFromCookie(c);
 * if (!token) {
 *   return c.text("Unauthorized", 401);
 * }
 * ```
 */
export function extractTokenFromCookie(c: Context): string | null {
  const cookie = c.req.header("Cookie");
  const tokenMatch = cookie?.match(/token=([^;]+)/);
  return tokenMatch ? tokenMatch[1] : null;
}
