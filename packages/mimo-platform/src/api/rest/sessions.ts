// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Router setup for the sessions internal API.
 *
 * Defines routes for session CRUD operations, chat history, and agent assignment.
 * Routes are mounted under /api/internal/sessions.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import {
  listSessionsHandler,
  getSessionHandler,
  createSessionHandler,
  updateSessionHandler,
  deleteSessionHandler,
  getChatHistoryHandler,
  assignAgentHandler,
  closeSessionHandler,
  getSessionDetailsHandler,
  addChatThreadHandler,
  touchSessionHandler,
  updateSessionConfigHandler,
  updateChatThreadHandler,
  deleteChatThreadHandler,
  setActiveChatThreadHandler,
  setActiveExpertThreadHandler,
  addTerminalHandler,
  listTerminalsHandler,
  deleteTerminalHandler,
} from "./sessions/handlers.js";

/**
 * Creates the sessions internal API router.
 *
 * Mounts all session-related endpoints under /api/internal/sessions.
 * Authentication is expected to be handled by parent router middleware.
 *
 * @param _mimoContext - The MimoContext (passed for consistency, unused directly)
 * @returns Configured Hono router for sessions endpoints
 */
export function createSessionsInternalRouter(_mimoContext: MimoContext): Hono {
  const router = new Hono();

  // List all sessions
  router.get("/", listSessionsHandler);

  // Create new session
  router.post("/", createSessionHandler);

  // Get specific session
  router.get("/:id", getSessionHandler);

  // Get session with full details (including project, agent, chat threads)
  router.get("/:id/details", getSessionDetailsHandler);

  // Update session
  router.put("/:id", updateSessionHandler);

  // Delete session
  router.delete("/:id", deleteSessionHandler);

  // Close session
  router.post("/:id/close", closeSessionHandler);

  // Touch session activity
  router.post("/:id/touch", touchSessionHandler);

  // Update session config
  router.put("/:id/config", updateSessionConfigHandler);

  // Get chat history
  router.get("/:id/chat", getChatHistoryHandler);

  // Assign agent to session
  router.post("/:id/assign-agent", assignAgentHandler);

  // Add chat thread
  router.post("/:id/chat-threads", addChatThreadHandler);

  // Update chat thread
  router.put("/:id/chat-threads/:threadId", updateChatThreadHandler);
  router.patch("/:id/chat-threads/:threadId", updateChatThreadHandler);

  // Delete chat thread
  router.delete("/:id/chat-threads/:threadId", deleteChatThreadHandler);

  // Set active chat thread
  router.post("/:id/active-thread", setActiveChatThreadHandler);

  // Set active expert thread
  router.post("/:id/active-expert-thread", setActiveExpertThreadHandler);

  // Add terminal
  router.post("/:id/terminals", addTerminalHandler);

  // List terminals
  router.get("/:id/terminals", listTerminalsHandler);

  // Delete terminal
  router.delete("/:id/terminals/:terminalId", deleteTerminalHandler);

  return router;
}
