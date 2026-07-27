// SPDX-License-Identifier: AGPL-3.0-only
/**
 * JWT validation middleware for the internal API.
 *
 * Extracts Bearer tokens from the Authorization header (preferred) or, when
 * no header is present, from the HttpOnly `token` cookie set by the web auth
 * flow. This lets same-origin browser fetches (which can't read the HttpOnly
 * cookie from JS) authenticate via the automatically-sent cookie without
 * exposing the token to client-side scripts.
 */

import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { MimoContext } from "../../../infrastructure/context/mimo-context.js";

/**
 * Creates JWT authentication middleware that validates Bearer tokens.
 *
 * The middleware:
 * 1. Extracts the Authorization header (or falls back to the `token` cookie)
 * 2. Parses the Bearer token
 * 3. Validates the token using JwtService
 * 4. Sets the user context if valid, or returns 401 if invalid
 *
 * @param mimoContext - The MimoContext containing the auth service
 * @returns Hono middleware handler for JWT validation
 *
 * @example
 * ```typescript
 * const router = new Hono();
 * router.use("/*", createInternalAuthMiddleware(mimoContext));
 * ```
 */
export function createInternalAuthMiddleware(
  mimoContext: Pick<MimoContext, "services">,
): MiddlewareHandler {
  return async (c, next) => {
    // Prefer a well-formed Bearer token from the Authorization header (used
    // by API clients). Fall back to the HttpOnly `token` cookie so that
    // same-origin browser fetches — which can't read the HttpOnly cookie
    // from JS but send it automatically — can authenticate too.
    //
    // Only reject the request when the Authorization header looks like an
    // *attempt* at a Bearer token (i.e. it starts with "Bearer ") but is
    // malformed. A header in any other scheme (or empty) must not block
    // the cookie fallback: in practice, reverse proxies (Cloudflare, etc.)
    // and browser extensions can attach their own Authorization headers
    // that the application does not control.
    const authHeader = c.req.header("Authorization");

    let token: string | undefined;
    const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch) {
      token = bearerMatch[1];
    } else if (authHeader && /^Bearer\s*$/i.test(authHeader)) {
      // "Bearer" with no token value is a clear client mistake; surface it.
      return c.json(
        {
          success: false,
          error:
            "Invalid Authorization header format. Expected: Bearer <token>",
          code: 401,
        },
        401,
      );
    } else {
      token = getCookie(c, "token");
    }

    if (!token) {
      return c.json(
        {
          success: false,
          error: "Missing Authorization header",
          code: 401,
        },
        401,
      );
    }

    const payload = await mimoContext.services.auth.verifyToken(token);

    if (!payload) {
      return c.json(
        {
          success: false,
          error: "Invalid or expired token",
          code: 401,
        },
        401,
      );
    }

    // Set user context for downstream handlers
    c.set("user", { username: payload.username });
    await next();
  };
}
