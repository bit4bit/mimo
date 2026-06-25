// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request handlers for the sessions internal API.
 *
 * Provides CRUD operations, chat history, and agent assignment for sessions.
 * All handlers are pure functions that operate on injected dependencies.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type {
  CreateSessionRequest,
  UpdateSessionRequest,
  AssignAgentRequest,
  CloseSessionRequest,
} from "./types.js";
import { toSessionResponse, toChatThreadResponse } from "./types.js";
import { authorizeUse } from "../../../domain/agents/sharing.js";
import type { MimoContext } from "../../../infrastructure/context/mimo-context.js";
import type { Session } from "../../../domain/sessions/repository.js";

// ─── Shared handler helpers ──────────────────────────────────────────────────

/** Extracts a human-readable message from a thrown value. */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** A guard either yields a value to proceed with, or a response to return. */
type Guard<T> = { ok: true; value: T } | { ok: false; response: Response };

interface OwnedSession {
  user: { username: string };
  mimoContext: MimoContext;
  session: Session;
}

/**
 * Resolves the session referenced by the `:id` route param, owned by the
 * authenticated user. Returns the appropriate error response otherwise:
 * 401 (unauthenticated), 400 (missing id), or 404 (not found / not owner).
 */
async function resolveOwnedSession(
  c: InternalApiContext,
): Promise<Guard<OwnedSession>> {
  const user = c.get("user");
  if (!user) {
    return {
      ok: false,
      response: c.json(errorResponse("Unauthorized", 401), 401),
    };
  }

  const id = c.req.param("id");
  if (!id) {
    return {
      ok: false,
      response: c.json(errorResponse("Session ID is required", 400), 400),
    };
  }

  const mimoContext = c.get("mimoContext");
  const session = await mimoContext.repos.sessions.findById(id);
  if (!session) {
    return {
      ok: false,
      response: c.json(errorResponse("Session not found in repository", 404), 404),
    };
  }
  if (session.owner !== user.username) {
    return {
      ok: false,
      response: c.json(errorResponse("Session not owned by user", 404), 404),
    };
  }

  return { ok: true, value: { user, mimoContext, session } };
}

/** True if the user owns the agent or it is shared with them. */
async function userMayUseAgent(
  mimoContext: MimoContext,
  agentId: string,
  username: string,
): Promise<boolean> {
  const agent = await mimoContext.repos.agents.findById(agentId);
  return !!agent && authorizeUse(agent, username);
}

/**
 * Validates the shared session config fields (priority, sessionTtlDays,
 * idleTimeoutMs). Returns an error message, or null when valid.
 */
function validateSessionConfig(body: {
  priority?: unknown;
  sessionTtlDays?: unknown;
  idleTimeoutMs?: unknown;
}): string | null {
  if (body.priority !== undefined) {
    const valid = ["high", "medium", "low"];
    if (!valid.includes(body.priority as string)) {
      return "Priority must be one of: high, medium, low";
    }
  }
  if (body.sessionTtlDays !== undefined) {
    const v = body.sessionTtlDays;
    if (!Number.isInteger(v) || (v as number) < 1) {
      return "sessionTtlDays must be an integer >= 1";
    }
  }
  if (body.idleTimeoutMs !== undefined) {
    const v = body.idleTimeoutMs as number;
    if (v !== 0 && v < 10000) {
      return "idleTimeoutMs must be at least 10000ms or 0 to disable";
    }
  }
  return null;
}

/** Validates clonePort when present. Returns an error message, or null. */
function validateClonePort(body: { clonePort?: unknown }): string | null {
  if (body.clonePort !== undefined && body.clonePort !== null) {
    const v = body.clonePort as number;
    if (!Number.isInteger(v) || v < 1 || v > 65535) {
      return "SSH port must be an integer between 1 and 65535";
    }
  }
  return null;
}

/**
 * Touch session activity to update lastActivityAt.
 * POST /api/internal/sessions/:id/touch
 */
export async function touchSessionHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const id = session.id;

  await mimoContext.repos.sessions.touchSessionActivity(id);

  return c.json(successResponse({ success: true }));
}

/**
 * Update session configuration (idleTimeoutMs, sessionTtlDays, priority).
 * PUT /api/internal/sessions/:id/config
 */
export async function updateSessionConfigHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const id = session.id;

  const body = (await c.req.json()) as UpdateSessionRequest;

  const configError = validateSessionConfig(body);
  if (configError) {
    return c.json(errorResponse(configError, 400), 400);
  }

  // Validate browserNotificationsEnabled if provided
  if (
    body.browserNotificationsEnabled !== undefined &&
    typeof body.browserNotificationsEnabled !== "boolean"
  ) {
    return c.json(
      errorResponse("browserNotificationsEnabled must be a boolean", 400),
      400,
    );
  }

  try {
    const updates: Parameters<typeof mimoContext.repos.sessions.update>[1] = {};
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.sessionTtlDays !== undefined)
      updates.sessionTtlDays = body.sessionTtlDays;
    if (body.idleTimeoutMs !== undefined)
      updates.idleTimeoutMs = body.idleTimeoutMs;
    if (body.browserNotificationsEnabled !== undefined)
      updates.browserNotificationsEnabled = body.browserNotificationsEnabled;

    const updated = await mimoContext.repos.sessions.update(id, updates);

    if (!updated) {
      return c.json(errorResponse("Failed to update session config", 500), 500);
    }

    return c.json(
      successResponse({
        session: toSessionResponse(updated),
      }),
    );
  } catch (error) {
    return c.json(
      errorResponse(
        errorMessage(error, "Failed to update session config"),
        500,
      ),
      500,
    );
  }
}

/**
 * List all sessions for the authenticated user.
 * GET /api/internal/sessions
 */
export async function listSessionsHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const sessions = await mimoContext.repos.sessions.listAll();
  const userSessions = sessions.filter((s) => s.owner === user.username);

  return c.json(
    successResponse({
      sessions: userSessions.map(toSessionResponse),
    }),
  );
}

/**
 * Get a specific session by ID.
 * GET /api/internal/sessions/:id
 */
export async function getSessionHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;

  return c.json(
    successResponse({
      session: toSessionResponse(guard.value.session),
    }),
  );
}

/**
 * Create a new session.
 * POST /api/internal/sessions
 */
export async function createSessionHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const body = (await c.req.json()) as CreateSessionRequest;

  // Validate required fields
  if (!body.name || !body.projectId) {
    return c.json(errorResponse("Name and project ID are required", 400), 400);
  }

  const configError = validateSessionConfig(body);
  if (configError) {
    return c.json(errorResponse(configError, 400), 400);
  }

  const portError = validateClonePort(body);
  if (portError) {
    return c.json(errorResponse(portError, 400), 400);
  }

  // Verify project exists and belongs to user
  const project = await mimoContext.repos.projects.findById(body.projectId);
  if (!project || project.owner !== user.username) {
    return c.json(errorResponse("Project not found", 404), 404);
  }

  // If assigning an agent up front, the user must own it or it must be shared
  // with them.
  if (
    body.assignedAgentId &&
    !(await userMayUseAgent(mimoContext, body.assignedAgentId, user.username))
  ) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  try {
    const session = await mimoContext.repos.sessions.create({
      name: body.name,
      projectId: body.projectId,
      owner: user.username,
      assignedAgentId: body.assignedAgentId,
      agentSubpath: body.agentSubpath,
      branchName: body.branchName,
      mcpServerIds: body.mcpServerIds,
      sessionTtlDays: body.sessionTtlDays,
      priority: body.priority,
      ...(body.instructions !== undefined && {
        instructions: body.instructions,
      }),
      ...(body.clonePort != null && { clonePort: body.clonePort }),
    });

    return c.json(
      successResponse({
        session: toSessionResponse(session),
      }),
      201,
    );
  } catch (error) {
    return c.json(
      errorResponse(errorMessage(error, "Failed to create session"), 500),
      500,
    );
  }
}

/**
 * Update a session.
 * PUT /api/internal/sessions/:id
 */
export async function updateSessionHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const id = session.id;

  const body = (await c.req.json()) as UpdateSessionRequest;

  const portError = validateClonePort(body);
  if (portError) {
    return c.json(errorResponse(portError, 400), 400);
  }

  const configError = validateSessionConfig(body);
  if (configError) {
    return c.json(errorResponse(configError, 400), 400);
  }

  try {
    const updates: Parameters<typeof mimoContext.repos.sessions.update>[1] = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.sessionTtlDays !== undefined)
      updates.sessionTtlDays = body.sessionTtlDays;
    if (body.idleTimeoutMs !== undefined)
      updates.idleTimeoutMs = body.idleTimeoutMs;
    if (body.branch !== undefined) updates.branch = body.branch;
    if (body.agentWorkspaceUser !== undefined)
      updates.agentWorkspaceUser = body.agentWorkspaceUser;
    if (body.agentWorkspacePassword !== undefined)
      updates.agentWorkspacePassword = body.agentWorkspacePassword;
    if (body.frameState !== undefined) updates.frameState = body.frameState;
    if (body.status !== undefined) updates.status = body.status;
    if (body.closeReason !== undefined) updates.closeReason = body.closeReason;
    if (body.instructions !== undefined)
      updates.instructions = body.instructions;
    if (body.clonePort !== undefined)
      updates.clonePort = body.clonePort ?? undefined;

    const updated = await mimoContext.repos.sessions.update(id, updates);

    if (!updated) {
      return c.json(errorResponse("Failed to update session", 500), 500);
    }

    return c.json(
      successResponse({
        session: toSessionResponse(updated),
      }),
    );
  } catch (error) {
    return c.json(
      errorResponse(errorMessage(error, "Failed to update session"), 500),
      500,
    );
  }
}

/**
 * Delete a session.
 * DELETE /api/internal/sessions/:id
 */
export async function deleteSessionHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const id = session.id;

  await mimoContext.repos.sessions.delete(session.projectId, id);

  return c.json(successResponse({ success: true }));
}

/**
 * Get chat history for a session.
 * GET /api/internal/sessions/:id/chat
 */
export async function getChatHistoryHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const id = session.id;

  const threadId = c.req.query("threadId") || session.activeChatThreadId;
  const messages = await mimoContext.services.chat.loadHistory(
    id,
    threadId ?? undefined,
  );

  return c.json(
    successResponse({
      messages,
    }),
  );
}

/**
 * Assign an agent to a session.
 * POST /api/internal/sessions/:id/assign-agent
 */
export async function assignAgentHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const id = session.id;

  const body = (await c.req.json()) as AssignAgentRequest;

  if (!body.agentId) {
    return c.json(errorResponse("Agent ID is required", 400), 400);
  }

  // Verify the user may use the agent (owned or shared with them).
  if (!(await userMayUseAgent(mimoContext, body.agentId, user.username))) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  try {
    const updated = await mimoContext.repos.sessions.update(id, {
      assignedAgentId: body.agentId,
    });

    if (!updated) {
      return c.json(errorResponse("Failed to assign agent", 500), 500);
    }

    return c.json(
      successResponse({
        session: toSessionResponse(updated),
      }),
    );
  } catch (error) {
    return c.json(
      errorResponse(errorMessage(error, "Failed to assign agent"), 500),
      500,
    );
  }
}

/**
 * Close a session.
 * POST /api/internal/sessions/:id/close
 */
export async function closeSessionHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const id = session.id;

  const body = (await c.req.json().catch(() => ({}))) as CloseSessionRequest;

  try {
    const updated = await mimoContext.repos.sessions.update(id, {
      status: "closed",
      ...(body.closeReason && { closeReason: body.closeReason }),
    });

    if (!updated) {
      return c.json(errorResponse("Failed to close session", 500), 500);
    }

    return c.json(
      successResponse({
        session: toSessionResponse(updated),
      }),
    );
  } catch (error) {
    return c.json(
      errorResponse(errorMessage(error, "Failed to close session"), 500),
      500,
    );
  }
}

/**
 * Get session with full details including chat threads.
 * GET /api/internal/sessions/:id/details
 */
export async function getSessionDetailsHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const id = session.id;

  // Get project info
  const project = await mimoContext.repos.projects.findById(session.projectId);

  // Get assigned agent if any
  let agent = null;
  if (session.assignedAgentId) {
    agent = await mimoContext.repos.agents.findById(session.assignedAgentId);
  }

  // Get chat history for active thread
  const chatHistory = await mimoContext.services.chat.loadHistory(
    id,
    session.activeChatThreadId ?? undefined,
  );

  return c.json(
    successResponse({
      session: {
        ...toSessionResponse(session),
        chatThreads: session.chatThreads.map(toChatThreadResponse),
        activeChatThreadId: session.activeChatThreadId,
      },
      project: project
        ? {
            id: project.id,
            name: project.name,
            repoUrl: project.repoUrl,
            repoType: project.repoType,
          }
        : null,
      agent: agent
        ? {
            id: agent.id,
            name: agent.name,
            status: agent.status,
          }
        : null,
      chatHistory,
    }),
  );
}

/**
 * Add a chat thread to a session.
 * POST /api/internal/sessions/:id/chat-threads
 */
export async function addChatThreadHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const sessionId = session.id;

  const body = await c.req.json();

  // Validate required fields
  if (!body.name || typeof body.name !== "string") {
    return c.json(errorResponse("name is required", 400), 400);
  }

  if (!body.model || typeof body.model !== "string") {
    return c.json(errorResponse("model is required", 400), 400);
  }

  if (!body.mode || typeof body.mode !== "string") {
    return c.json(errorResponse("mode is required", 400), 400);
  }

  if (!body.assignedAgentId || typeof body.assignedAgentId !== "string") {
    return c.json(errorResponse("assignedAgentId is required", 400), 400);
  }

  // The user may only assign agents they own or that are shared with them.
  if (
    !(await userMayUseAgent(mimoContext, body.assignedAgentId, user.username))
  ) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  // Resolve instructions: thread > session > project
  let instructions: string | undefined = body.instructions;
  if (!instructions) {
    instructions = session.instructions;
    if (!instructions) {
      const project = await mimoContext.repos.projects.findById(
        session.projectId,
      );
      instructions = project?.instructions;
    }
  }

  let thread: Awaited<
    ReturnType<typeof mimoContext.repos.sessions.addChatThread>
  >;
  try {
    thread = await mimoContext.repos.sessions.addChatThread(sessionId, {
      name: body.name,
      model: body.model,
      mode: body.mode,
      acpSessionId: body.acpSessionId || null,
      assignedAgentId: body.assignedAgentId,
      state: body.state || "active",
      brainWash: body.brainWash ?? false,
      ...(instructions !== undefined && { instructions }),
    });
  } catch (error) {
    return c.json(
      errorResponse(errorMessage(error, "Failed to add chat thread"), 400),
      400,
    );
  }

  // Save instructions as system message in chat history
  if (instructions) {
    await mimoContext.services.chat.saveMessage(
      sessionId,
      {
        role: "system",
        content: instructions,
        timestamp: new Date().toISOString(),
      },
      thread.id,
    );

    // Emit initial_prompt to agent so it processes the instruction
    const agentId = thread.assignedAgentId || session.assignedAgentId;
    if (agentId) {
      await mimoContext.services.agents.sendToAgent(agentId, {
        type: "initial_prompt",
        sessionId,
        chatThreadId: thread.id,
        content: instructions,
      });
    }
  }

  // Update session activity
  await mimoContext.repos.sessions.touchSessionActivity(sessionId);

  return c.json(
    successResponse({
      thread: toChatThreadResponse(thread),
    }),
    201,
  );
}

/**
 * Update a chat thread in a session.
 * PUT /api/internal/sessions/:id/chat-threads/:threadId
 */
export async function updateChatThreadHandler(
  c: InternalApiContext,
): Promise<Response> {
  const threadId = c.req.param("threadId");
  if (!threadId) {
    return c.json(
      errorResponse("Session ID and thread ID are required", 400),
      400,
    );
  }

  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const sessionId = session.id;

  const body = await c.req.json();
  const updates: Partial<
    Pick<
      import("../../../domain/sessions/repository.js").ChatThread,
      "name" | "model" | "mode" | "acpSessionId" | "state" | "instructions"
    >
  > = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.model !== undefined) updates.model = body.model;
  if (body.mode !== undefined) updates.mode = body.mode;
  if (body.acpSessionId !== undefined) updates.acpSessionId = body.acpSessionId;
  if (body.state !== undefined) updates.state = body.state;
  if (body.instructions !== undefined) updates.instructions = body.instructions;
  if (body.brainWash !== undefined) updates.brainWash = body.brainWash;

  let updated: Awaited<
    ReturnType<typeof mimoContext.repos.sessions.updateChatThread>
  >;
  try {
    updated = await mimoContext.repos.sessions.updateChatThread(
      sessionId,
      threadId,
      updates,
    );
  } catch (error) {
    return c.json(
      errorResponse(errorMessage(error, "Failed to update chat thread"), 400),
      400,
    );
  }

  if (!updated) {
    return c.json(errorResponse("Thread not found", 404), 404);
  }

  return c.json(
    successResponse({
      session: toSessionResponse(
        await mimoContext.repos.sessions.findById(sessionId)!,
      ),
    }),
  );
}

/**
 * Remove a chat thread from a session.
 * DELETE /api/internal/sessions/:id/chat-threads/:threadId
 */
export async function deleteChatThreadHandler(
  c: InternalApiContext,
): Promise<Response> {
  const threadId = c.req.param("threadId");
  if (!threadId) {
    return c.json(
      errorResponse("Session ID and thread ID are required", 400),
      400,
    );
  }

  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const sessionId = session.id;

  const threadExists = session.chatThreads.some((t) => t.id === threadId);
  if (!threadExists) {
    return c.json(errorResponse("Thread not found", 404), 404);
  }

  await mimoContext.repos.sessions.removeChatThread(sessionId, threadId);

  return c.body(null, 204);
}

/**
 * Set the active chat thread for a session.
 * POST /api/internal/sessions/:id/active-thread
 */
export async function setActiveChatThreadHandler(
  c: InternalApiContext,
): Promise<Response> {
  const guard = await resolveOwnedSession(c);
  if (!guard.ok) return guard.response;
  const { user, mimoContext, session } = guard.value;
  const sessionId = session.id;

  const body = await c.req.json();
  if (!body.threadId || typeof body.threadId !== "string") {
    return c.json(errorResponse("threadId is required", 400), 400);
  }

  try {
    await mimoContext.repos.sessions.setActiveChatThread(
      sessionId,
      body.threadId,
    );
    return c.json(successResponse({ success: true }));
  } catch (error) {
    return c.json(
      errorResponse(errorMessage(error, "Failed to set active thread"), 400),
      400,
    );
  }
}
