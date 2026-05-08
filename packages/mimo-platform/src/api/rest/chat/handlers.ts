// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request handlers for the chat internal API.
 *
 * Provides chat message persistence operations.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type { SaveMessageRequest } from "./types.js";

/**
 * Save a chat message.
 * POST /api/internal/chat/messages
 */
export async function saveMessageHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const body = (await c.req.json()) as SaveMessageRequest;

  // Validate required fields
  if (!body.sessionId) {
    return c.json(errorResponse("sessionId is required", 400), 400);
  }

  if (!body.chatThreadId) {
    return c.json(errorResponse("chatThreadId is required", 400), 400);
  }

  if (!body.role || !["user", "assistant", "system"].includes(body.role)) {
    return c.json(
      errorResponse("role must be user, assistant, or system", 400),
      400,
    );
  }

  if (body.content === undefined || body.content === null) {
    return c.json(errorResponse("content is required", 400), 400);
  }

  // Verify the session exists and belongs to the user
  const session = await mimoContext.repos.sessions.findById(body.sessionId);
  if (!session || session.owner !== user.username) {
    return c.json(errorResponse("Session not found", 404), 404);
  }

  // Verify the chat thread exists
  const threadExists = session.chatThreads.some(
    (t) => t.id === body.chatThreadId,
  );
  if (!threadExists) {
    return c.json(errorResponse("Chat thread not found", 404), 404);
  }

  // Save the message
  await mimoContext.services.chat.saveMessage(
    body.sessionId,
    body.chatThreadId,
    {
      role: body.role,
      content: body.content,
      metadata: body.metadata,
    },
  );

  // Update session activity
  await mimoContext.repos.sessions.touchSessionActivity(body.sessionId);

  return c.json(
    successResponse({
      success: true,
      timestamp: new Date().toISOString(),
    }),
  );
}
