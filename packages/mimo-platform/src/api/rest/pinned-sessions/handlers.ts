// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request handlers for the pinned-sessions internal API.
 *
 * Provides CRUD operations for the per-user pinned-session store.
 * All handlers are pure functions that operate on injected dependencies
 * via the Hono context.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type {
  CreatePinRequest,
  PinListEntryResponse,
  PinListResponse,
  ReorderPinsRequest,
} from "./types.js";
import {
  DEFAULT_GROUP,
  PinLimitReachedError,
  type PinnedSessionEntry,
} from "../../../domain/pinned-sessions/repository.js";

/**
 * Resolve a raw pin entry into a {@link PinListEntryResponse}, marking it
 * stale when the underlying session can no longer be found.
 */
async function resolveEntry(
  ctx: InternalApiContext,
  entry: PinnedSessionEntry,
): Promise<PinListEntryResponse> {
  const session = await ctx
    .get("mimoContext")
    .repos.sessions.findById(entry.sessionId);
  if (!session) {
    return {
      sessionId: entry.sessionId,
      projectId: entry.projectId,
      sessionTitle: null,
      branch: null,
      group: entry.group ?? DEFAULT_GROUP,
      stale: true,
    };
  }
  return {
    sessionId: entry.sessionId,
    projectId: entry.projectId,
    sessionTitle: session.name,
    branch: session.branch ?? null,
    group: entry.group ?? DEFAULT_GROUP,
    stale: false,
  };
}

/**
 * List pinned sessions for the authenticated user.
 * GET /api/internal/users/:userId/pinned-sessions[?group=<name>]
 */
export async function listPinsHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user");
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }
  const ctx = c.get("mimoContext");
  const group = c.req.query("group");
  const entries = group
    ? await ctx.repos.pinnedSessions.listByGroup(user.username, group)
    : await ctx.repos.pinnedSessions.list(user.username);
  const pins = await Promise.all(
    entries.map((e: PinnedSessionEntry) => resolveEntry(c, e)),
  );
  const body: PinListResponse = { pins };
  return c.json(successResponse(body));
}

/**
 * Create (or move-to-front) a pin for the authenticated user.
 * POST /api/internal/users/:userId/pinned-sessions
 */
export async function createPinHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user");
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }
  const ctx = c.get("mimoContext");
  const body = (await c.req.json()) as Partial<CreatePinRequest>;
  if (!body || !body.sessionId || !body.projectId) {
    return c.json(
      errorResponse("sessionId and projectId are required", 400),
      400,
    );
  }
  if (
    body.group !== undefined &&
    (typeof body.group !== "string" || body.group.trim().length === 0)
  ) {
    return c.json(
      errorResponse("group must be a non-empty string when provided", 400),
      400,
    );
  }
  try {
    const entries = await ctx.repos.pinnedSessions.add(user.username, {
      sessionId: body.sessionId,
      projectId: body.projectId,
      group: body.group,
    });
    const pins = await Promise.all(
      entries.map((e: PinnedSessionEntry) => resolveEntry(c, e)),
    );
    return c.json(successResponse({ pins }), 201);
  } catch (err) {
    if (err instanceof PinLimitReachedError) {
      return c.json(
        {
          success: false,
          error: "pin_limit_reached",
          limit: err.limit,
          code: 409,
        },
        409,
      );
    }
    const message = err instanceof Error ? err.message : "Failed to create pin";
    return c.json(errorResponse(message, 400), 400);
  }
}

/**
 * Delete a pin by sessionId (and optional group).
 * DELETE /api/internal/users/:userId/pinned-sessions/:sessionId[?group=<name>]
 */
export async function deletePinHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user");
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }
  const sessionId = c.req.param("sessionId");
  if (!sessionId) {
    return c.json(errorResponse("sessionId is required", 400), 400);
  }
  const ctx = c.get("mimoContext");
  const group = c.req.query("group");
  if (
    group !== undefined &&
    (typeof group !== "string" || group.trim().length === 0)
  ) {
    return c.json(
      errorResponse("group must be a non-empty string when provided", 400),
      400,
    );
  }
  await ctx.repos.pinnedSessions.removeByGroup(user.username, sessionId, group);
  return new Response(null, { status: 204 });
}

/**
 * Reorder the authenticated user's pins.
 * PUT /api/internal/users/:userId/pinned-sessions
 */
export async function reorderPinsHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user");
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }
  const ctx = c.get("mimoContext");
  const body = (await c.req.json()) as Partial<ReorderPinsRequest>;
  if (!body || !Array.isArray(body.order)) {
    return c.json(errorResponse("order array is required", 400), 400);
  }
  try {
    const entries = await ctx.repos.pinnedSessions.reorder(
      user.username,
      body.order,
    );
    const pins = await Promise.all(
      entries.map((e: PinnedSessionEntry) => resolveEntry(c, e)),
    );
    return c.json(successResponse({ pins }));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reorder pins";
    return c.json(errorResponse(message, 400), 400);
  }
}
