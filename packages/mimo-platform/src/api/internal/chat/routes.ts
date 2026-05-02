/**
 * Router setup for the chat internal API.
 *
 * Defines routes for chat message operations.
 * Routes are mounted under /api/internal/chat.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../../context/mimo-context.js";
import { saveMessageHandler } from "./handlers.js";

/**
 * Creates the chat internal API router.
 *
 * Mounts all chat-related endpoints under /api/internal/chat.
 * Authentication is expected to be handled by parent router middleware.
 *
 * @param _mimoContext - The MimoContext (passed for consistency, unused directly)
 * @returns Configured Hono router for chat endpoints
 */
export function createChatInternalRouter(_mimoContext: MimoContext): Hono {
  const router = new Hono();

  // Save a chat message
  router.post("/messages", saveMessageHandler);

  return router;
}
