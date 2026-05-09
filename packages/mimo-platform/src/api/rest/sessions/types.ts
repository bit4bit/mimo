// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request and response types for the sessions internal API.
 *
 * These types define the data contracts for all session-related
 * endpoints in the internal API.
 */

import type {
  Session,
  SessionPriority,
  ChatThread,
} from "../../../domain/sessions/repository.js";

/**
 * Session response format for API serialization.
 * Dates are serialized as ISO strings.
 */
export interface SessionResponse {
  id: string;
  name: string;
  projectId: string;
  owner: string;
  status: "active" | "paused" | "closed";
  port: number | null;
  priority: "high" | "medium" | "low";
  sessionTtlDays: number;
  idleTimeoutMs: number;
  closeReason?: string;
  assignedAgentId?: string;
  agentSubpath?: string;
  branch?: string;
  acpStatus: "active" | "parked";
  syncState: "idle" | "syncing" | "error";
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Workspace paths (required for VCS operations)
  upstreamPath: string;
  agentWorkspacePath: string;
  fossilPath: string;
  // Credentials
  agentWorkspaceUser?: string;
  agentWorkspacePassword?: string;
  // MCP token
  mcpToken?: string;
  // Chat threads
  chatThreads: ChatThreadResponse[];
  activeChatThreadId?: string | null;
  // Frame state
  frameState?: import("../../../domain/sessions/frame-state.js").FrameState;
  // Instructions
  instructions?: string;
}

/**
 * Chat thread response format for API serialization.
 */
export interface ChatThreadResponse {
  id: string;
  name: string;
  model: string;
  mode: string;
  acpSessionId: string | null;
  assignedAgentId: string | null;
  state: "active" | "parked" | "waking" | "disconnected";
  instructions?: string;
  createdAt: string;
}

/**
 * Chat message response format.
 */
export interface ChatMessageResponse {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  chatThreadId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request body for creating a new session.
 */
export interface CreateSessionRequest {
  name: string;
  projectId: string;
  assignedAgentId?: string;
  agentSubpath?: string;
  branchName?: string;
  mcpServerIds?: string[];
  sessionTtlDays?: number;
  priority?: SessionPriority;
  instructions?: string;
}

/**
 * Request body for updating a session.
 */
export interface UpdateSessionRequest {
  name?: string;
  priority?: SessionPriority;
  sessionTtlDays?: number;
  idleTimeoutMs?: number;
  branch?: string;
  agentWorkspaceUser?: string;
  agentWorkspacePassword?: string;
  frameState?: import("../../../domain/sessions/frame-state.js").FrameState;
  status?: "active" | "paused" | "closed";
  closeReason?: string;
  instructions?: string;
}

/**
 * Request body for assigning an agent to a session.
 */
export interface AssignAgentRequest {
  agentId: string;
}

/**
 * Request body for closing a session.
 */
export interface CloseSessionRequest {
  closeReason?: string;
}

/**
 * List sessions response.
 */
export interface ListSessionsResponse {
  sessions: SessionResponse[];
}

/**
 * Get session response.
 */
export interface GetSessionResponse {
  session: SessionResponse;
}

/**
 * Get session chat history response.
 */
export interface GetChatHistoryResponse {
  messages: ChatMessageResponse[];
}

/**
 * Converts a Session entity to API response format.
 */
export function toSessionResponse(session: Session): SessionResponse {
  return {
    id: session.id,
    name: session.name,
    projectId: session.projectId,
    owner: session.owner,
    status: session.status,
    port: session.port,
    priority: session.priority,
    sessionTtlDays: session.sessionTtlDays,
    idleTimeoutMs: session.idleTimeoutMs,
    ...(session.closeReason && { closeReason: session.closeReason }),
    ...(session.assignedAgentId && {
      assignedAgentId: session.assignedAgentId,
    }),
    ...(session.agentSubpath && { agentSubpath: session.agentSubpath }),
    ...(session.branch && { branch: session.branch }),
    acpStatus: session.acpStatus,
    syncState: session.syncState,
    lastActivityAt: session.lastActivityAt,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    // Workspace paths
    upstreamPath: session.upstreamPath,
    agentWorkspacePath: session.agentWorkspacePath,
    fossilPath: session.fossilPath,
    // Credentials
    ...(session.agentWorkspaceUser && {
      agentWorkspaceUser: session.agentWorkspaceUser,
    }),
    ...(session.agentWorkspacePassword && {
      agentWorkspacePassword: session.agentWorkspacePassword,
    }),
    // MCP token
    ...(session.mcpToken && { mcpToken: session.mcpToken }),
    // Chat threads
    chatThreads: session.chatThreads.map(toChatThreadResponse),
    activeChatThreadId: session.activeChatThreadId ?? null,
    // Frame state
    ...(session.frameState && { frameState: session.frameState }),
    // Instructions
    ...(session.instructions && { instructions: session.instructions }),
  };
}

/**
 * Converts a ChatThread entity to API response format.
 */
export function toChatThreadResponse(thread: ChatThread): ChatThreadResponse {
  return {
    id: thread.id,
    name: thread.name,
    model: thread.model,
    mode: thread.mode,
    acpSessionId: thread.acpSessionId,
    assignedAgentId: thread.assignedAgentId,
    state: thread.state,
    ...(thread.instructions && { instructions: thread.instructions }),
    createdAt: thread.createdAt,
  };
}
