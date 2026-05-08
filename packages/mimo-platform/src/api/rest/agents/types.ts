// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request and response types for the agents internal API.
 *
 * These types define the data contracts for all agent-related
 * endpoints in the internal API.
 */

import type {
  Agent,
  AgentCapabilities,
  AgentStatus,
  AgentProvider,
} from "../../../domain/agents/repository.js";

/**
 * Agent response format for API serialization.
 * Dates are serialized as ISO strings.
 */
export interface AgentResponse {
  id: string;
  name: string;
  owner: string;
  status: AgentStatus;
  provider: AgentProvider;
  startedAt: string;
  updatedAt: string;
  lastActivityAt?: string;
  capabilities?: AgentCapabilities;
}

/**
 * Request body for creating a new agent.
 */
export interface CreateAgentRequest {
  name: string;
  provider: AgentProvider;
}

/**
 * Request body for updating an agent.
 */
export interface UpdateAgentRequest {
  name?: string;
}

/**
 * List agents response.
 */
export interface ListAgentsResponse {
  agents: AgentResponse[];
}

/**
 * Get agent response.
 */
export interface GetAgentResponse {
  agent: AgentResponse;
  token: string;
}

/**
 * Create agent response.
 */
export interface CreateAgentResponse {
  agent: AgentResponse;
  token: string;
}

/**
 * Update agent response.
 */
export interface UpdateAgentResponse {
  agent: AgentResponse;
}

/**
 * Delete agent response.
 */
export interface DeleteAgentResponse {
  success: boolean;
}

/**
 * Get capabilities response.
 */
export interface GetCapabilitiesResponse {
  capabilities: AgentCapabilities;
}

/**
 * Refresh capabilities response.
 */
export interface RefreshCapabilitiesResponse {
  success: boolean;
  requested: boolean;
}

/**
 * Converts an Agent entity to API response format.
 * Excludes the token field for security.
 */
export function toAgentResponse(agent: Agent): AgentResponse {
  return {
    id: agent.id,
    name: agent.name,
    owner: agent.owner,
    status: agent.status,
    provider: agent.provider,
    startedAt: agent.startedAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    ...(agent.lastActivityAt && {
      lastActivityAt: agent.lastActivityAt.toISOString(),
    }),
    ...(agent.capabilities && { capabilities: agent.capabilities }),
  };
}
