/**
 * Shared types for the internal API layer.
 *
 * Provides type definitions for the internal API context and handler types.
 */

import type { Context } from "hono";
import type { MimoContext } from "../../../context/mimo-context.js";

/**
 * Context type for internal API handlers.
 *
 * Combines the Hono context with injected MimoContext services.
 * This type is used by internal API route handlers to access
 * both HTTP context and application services.
 *
 * @example
 * ```typescript
 * app.get("/example", async (c: InternalApiContext) => {
 *   const sessions = await c.get("mimoContext").repos.sessions.listAll();
 *   return c.json(successResponse({ sessions }));
 * });
 * ```
 */
export interface InternalApiContext extends Context {
  get: Context["get"] & {
    <Key extends "mimoContext">(key: Key): MimoContext;
    <Key extends "user">(key: Key): { username: string } | undefined;
  };
  set: Context["set"] & {
    (key: "mimoContext", value: MimoContext): void;
    (key: "user", value: { username: string }): void;
  };
}

/**
 * Type alias for internal API route handlers.
 */
export type InternalApiHandler = (c: InternalApiContext) => Response | Promise<Response>;
