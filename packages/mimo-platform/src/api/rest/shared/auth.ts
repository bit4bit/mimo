/**
 * JWT validation middleware for the internal API.
 *
 * Extracts Bearer tokens from the Authorization header and validates
 * them using the JwtService from MimoContext.
 */

import type { MiddlewareHandler } from "hono";
import type { MimoContext } from "../../../infrastructure/context/mimo-context.js";

/**
 * Creates JWT authentication middleware that validates Bearer tokens.
 *
 * The middleware:
 * 1. Extracts the Authorization header
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
    const authHeader = c.req.header("Authorization");

    if (!authHeader) {
      return c.json(
        {
          success: false,
          error: "Missing Authorization header",
          code: 401,
        },
        401,
      );
    }

    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      return c.json(
        {
          success: false,
          error:
            "Invalid Authorization header format. Expected: Bearer <token>",
          code: 401,
        },
        401,
      );
    }

    const token = tokenMatch[1];
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
