// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request handlers for the agents internal API.
 *
 * Provides CRUD operations and capabilities management for agents.
 * All handlers are pure functions that operate on injected dependencies.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type { CreateAgentRequest, UpdateAgentRequest } from "./types.js";
import { toAgentResponse } from "./types.js";
import type { AgentCapabilities } from "../../../domain/agents/repository.js";
import {
  authorizeUse,
  validateShareInput,
} from "../../../domain/agents/sharing.js";

/**
 * List all agents for the authenticated user.
 * GET /api/internal/agents
 */
export async function listAgentsHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const [owned, shared] = await Promise.all([
    mimoContext.repos.agents.findByOwner(user.username),
    mimoContext.repos.agents.findSharedWith(user.username),
  ]);

  // Union owned + shared, de-duplicated by id (an owner is never in their own
  // sharedWith, but guard against overlap defensively).
  const byId = new Map<string, (typeof owned)[number]>();
  for (const agent of [...owned, ...shared]) {
    byId.set(agent.id, agent);
  }

  return c.json(
    successResponse({
      agents: [...byId.values()].map((agent) =>
        toAgentResponse(agent, agent.owner === user.username),
      ),
    }),
  );
}

/**
 * Get a specific agent by ID.
 * GET /api/internal/agents/:id
 */
export async function getAgentHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Agent ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const agent = await mimoContext.repos.agents.findById(id);

  if (!agent) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  const isOwner = agent.owner === user.username;
  const isShared = agent.sharedWith.some((g) => g.username === user.username);
  if (!isOwner && !isShared) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  // The token is owner-only and is never exposed to shared users.
  return c.json(
    successResponse({
      agent: toAgentResponse(agent, isOwner),
      ...(isOwner && { token: agent.token }),
    }),
  );
}

/**
 * Create a new agent.
 * POST /api/internal/agents
 */
export async function createAgentHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const body = (await c.req.json()) as CreateAgentRequest;

  // Validate required fields
  if (!body.name || body.name.trim().length === 0) {
    return c.json(errorResponse("Name is required", 400), 400);
  }

  // Validate name length
  if (body.name.length > 64) {
    return c.json(
      errorResponse("Name must be 64 characters or less", 400),
      400,
    );
  }

  // Validate provider
  if (!body.provider) {
    return c.json(errorResponse("Provider is required", 400), 400);
  }
  if (body.provider !== "opencode" && body.provider !== "claude") {
    return c.json(
      errorResponse("Provider must be 'opencode' or 'claude'", 400),
      400,
    );
  }

  try {
    const agent = await mimoContext.services.agents.createAgent({
      name: body.name.trim(),
      owner: user.username,
      provider: body.provider,
    });

    return c.json(
      successResponse({
        agent: toAgentResponse(agent),
        token: agent.token,
      }),
      201,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create agent";
    return c.json(errorResponse(message, 500), 500);
  }
}

/**
 * Update an agent.
 * PUT /api/internal/agents/:id
 */
export async function updateAgentHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Agent ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const agent = await mimoContext.repos.agents.findById(id);

  if (!agent) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  if (agent.owner !== user.username) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  const body = (await c.req.json()) as UpdateAgentRequest;

  // Validate name length if provided
  if (body.name && body.name.length > 64) {
    return c.json(
      errorResponse("Name must be 64 characters or less", 400),
      400,
    );
  }

  try {
    const updated = await mimoContext.repos.agents.update(id, {
      name: body.name?.trim(),
    });

    if (!updated) {
      return c.json(errorResponse("Failed to update agent", 500), 500);
    }

    return c.json(
      successResponse({
        agent: toAgentResponse(updated),
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update agent";
    return c.json(errorResponse(message, 500), 500);
  }
}

/**
 * Delete an agent.
 * DELETE /api/internal/agents/:id
 */
export async function deleteAgentHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Agent ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const agent = await mimoContext.repos.agents.findById(id);

  if (!agent) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  if (agent.owner !== user.username) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  await mimoContext.services.agents.deleteAgent(id);

  return c.json(successResponse({ success: true }));
}

/**
 * Get agent capabilities.
 * GET /api/internal/agents/:id/capabilities
 */
export async function getCapabilitiesHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Agent ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const agent = await mimoContext.repos.agents.findById(id);

  if (!agent) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  // Users the agent is shared with may read its capabilities so they can pick a
  // model/mode when using the agent in their chat threads.
  if (!authorizeUse(agent, user.username)) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  // Derive capabilities if not cached
  let capabilities: AgentCapabilities | null = agent.capabilities ?? null;

  const hasCachedCapabilities =
    capabilities &&
    Array.isArray(capabilities.availableModels) &&
    capabilities.availableModels.length > 0 &&
    Array.isArray(capabilities.availableModes) &&
    capabilities.availableModes.length > 0;

  if (!hasCachedCapabilities) {
    capabilities = await deriveCapabilities(c, id, mimoContext);

    if (capabilities) {
      await mimoContext.repos.agents.updateCapabilities(id, capabilities);
    }
  }

  if (!capabilities) {
    return c.json(errorResponse("No capabilities available", 404), 404);
  }

  return c.json(
    successResponse({
      capabilities,
    }),
  );
}

/**
 * Refresh agent capabilities.
 * POST /api/internal/agents/:id/capabilities/refresh
 */
export async function refreshCapabilitiesHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Agent ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const agent = await mimoContext.repos.agents.findById(id);

  if (!agent) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  if (agent.owner !== user.username) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  // Clear cached capabilities first
  await mimoContext.repos.agents.clearCapabilities(id);

  // If agent is online, request fresh capabilities
  const requested =
    await mimoContext.services.agents.requestCapabilitiesRefresh(id);

  return c.json(
    successResponse({
      success: true,
      requested,
    }),
  );
}

/**
 * Share an agent with another user (owner only).
 * POST /api/internal/agents/:id/shares
 */
export async function shareAgentHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Agent ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const agent = await mimoContext.repos.agents.findById(id);

  // Only the owner may manage sharing; hide the agent's existence otherwise.
  if (!agent || agent.owner !== user.username) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  const body = (await c.req.json().catch(() => ({}))) as { username?: string };
  const targetUsername =
    typeof body.username === "string" ? body.username.trim() : "";

  const targetExists = targetUsername
    ? await mimoContext.repos.users.exists(targetUsername)
    : false;

  const validation = validateShareInput({
    agent,
    targetUsername,
    targetExists,
  });
  if (!validation.ok) {
    return c.json(errorResponse(validation.error, 400), 400);
  }

  const updated = await mimoContext.repos.agents.addShare(id, targetUsername);
  if (!updated) {
    return c.json(errorResponse("Failed to share agent", 500), 500);
  }

  return c.json(
    successResponse({
      agent: toAgentResponse(updated, true),
    }),
  );
}

/**
 * Revoke a user's access to an agent (owner only).
 * DELETE /api/internal/agents/:id/shares/:username
 */
export async function revokeShareHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  const targetUsername = c.req.param("username");
  if (!id || !targetUsername) {
    return c.json(
      errorResponse("Agent ID and username are required", 400),
      400,
    );
  }

  const mimoContext = c.get("mimoContext");
  const agent = await mimoContext.repos.agents.findById(id);

  if (!agent || agent.owner !== user.username) {
    return c.json(errorResponse("Agent not found", 404), 404);
  }

  const updated = await mimoContext.repos.agents.removeShare(
    id,
    targetUsername,
  );
  if (!updated) {
    return c.json(errorResponse("Failed to revoke access", 500), 500);
  }

  return c.json(
    successResponse({
      agent: toAgentResponse(updated, true),
    }),
  );
}

/**
 * Derive capabilities for an agent from its assigned sessions.
 * This is a helper function that checks both session-based and thread-based capabilities.
 */
async function deriveCapabilities(
  c: InternalApiContext,
  agentId: string,
  mimoContext: ReturnType<InternalApiContext["get"]> & { mimoContext: any },
): Promise<AgentCapabilities | null> {
  const sessionRepo = mimoContext.repos.sessions;

  const [sessionAssigned, threadAssigned] = await Promise.all([
    sessionRepo.findByAssignedAgentId(agentId),
    sessionRepo.findByThreadAgentId(agentId),
  ]);

  const byId = new Map<string, any>();
  for (const session of [...sessionAssigned, ...threadAssigned]) {
    byId.set(session.id, session);
  }

  const sessions = [...byId.values()].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  for (const session of sessions) {
    const fromSession = buildCapabilitiesFromSessionState(session);
    if (fromSession) return fromSession;
  }

  for (const session of sessions) {
    const fromThread = buildCapabilitiesFromThread(agentId, session);
    if (fromThread) return fromThread;
  }

  return null;
}

/**
 * Build capabilities from session state (modelState and modeState).
 */
function buildCapabilitiesFromSessionState(
  session: any,
): AgentCapabilities | null {
  const modelState = session?.modelState;
  const modeState = session?.modeState;

  if (
    !modelState ||
    !modeState ||
    !hasOptions(modelState.availableModels) ||
    !hasOptions(modeState.availableModes)
  ) {
    return null;
  }

  return {
    availableModels: modelState.availableModels,
    defaultModelId:
      modelState.currentModelId || modelState.availableModels[0]?.value || "",
    availableModes: modeState.availableModes,
    defaultModeId:
      modeState.currentModeId || modeState.availableModes[0]?.value || "",
  };
}

/**
 * Build capabilities from thread assignment.
 */
function buildCapabilitiesFromThread(
  agentId: string,
  session: any,
): AgentCapabilities | null {
  const matchingThreads = Array.isArray(session?.chatThreads)
    ? session.chatThreads.filter(
        (thread: any) => thread?.assignedAgentId === agentId,
      )
    : [];

  if (matchingThreads.length === 0) return null;

  const activeThread = matchingThreads.find(
    (thread: any) => thread.id === session?.activeChatThreadId,
  );
  const fallbackThread = activeThread || matchingThreads[0];

  if (!fallbackThread?.model || !fallbackThread?.mode) return null;

  return {
    availableModels: [
      { value: fallbackThread.model, name: fallbackThread.model },
    ],
    defaultModelId: fallbackThread.model,
    availableModes: [{ value: fallbackThread.mode, name: fallbackThread.mode }],
    defaultModeId: fallbackThread.mode,
  };
}

/**
 * Check if options array has values.
 */
function hasOptions(options: unknown): boolean {
  return Array.isArray(options) && options.length > 0;
}
