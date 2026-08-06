// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request and response types for the dashboard internal API.
 *
 * These types define the data contracts for the dashboard data
 * aggregation endpoint.
 */

import type { AgentStatus } from "../../../domain/agents/repository.js";

/**
 * Dashboard project item (subset of project data for dashboard display).
 */
export interface DashboardProject {
  id: string;
  name: string;
  description?: string;
  repoUrl: string;
  owner: string;
  isPublic: boolean;
}

/**
 * Dashboard agent item (subset of agent data for dashboard display).
 */
export interface DashboardAgent {
  id: string;
  name: string;
  status: AgentStatus;
  startedAt: string;
  lastActivityAt?: string;
}

/**
 * Dashboard session item (subset of session data for dashboard display).
 */
export interface DashboardSession {
  id: string;
  name: string;
  projectId: string;
  assignedAgentId?: string;
  status: "active" | "paused" | "closed";
  createdAt: string;
  closeReason?: string;
}

/**
 * Dashboard stats data.
 */
export interface DashboardStats {
  totalProjects: number;
  totalAgents: number;
  onlineAgents: number;
  offlineAgents: number;
  activeSessions: number;
}

/**
 * Dashboard data response.
 * Aggregates projects, agents, recent sessions, and stats.
 */
export interface DashboardResponse {
  projects: DashboardProject[];
  agents: DashboardAgent[];
  recentSessions: DashboardSession[];
  stats: DashboardStats;
}

/**
 * Converts a Project entity to dashboard format.
 */
export function toDashboardProject(project: {
  id: string;
  name: string;
  description?: string;
  repositories?: Array<{ repoUrl?: string }>;
  owner: string;
  isPublic?: boolean;
}): DashboardProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    repoUrl: project.repositories?.[0]?.repoUrl ?? "",
    owner: project.owner,
    isPublic: project.isPublic ?? false,
  };
}

/**
 * Converts an Agent entity to dashboard format.
 * Dates are serialized as ISO strings.
 */
export function toDashboardAgent(agent: {
  id: string;
  name: string;
  status: AgentStatus;
  startedAt: Date;
  lastActivityAt?: Date;
}): DashboardAgent {
  return {
    id: agent.id,
    name: agent.name,
    status: agent.status,
    startedAt: agent.startedAt.toISOString(),
    ...(agent.lastActivityAt && {
      lastActivityAt: agent.lastActivityAt.toISOString(),
    }),
  };
}

/**
 * Converts a Session entity to dashboard format.
 * Dates are serialized as ISO strings.
 */
export function toDashboardSession(session: {
  id: string;
  name: string;
  projectId: string;
  assignedAgentId?: string;
  status: "active" | "paused" | "closed";
  createdAt: Date;
  closeReason?: string;
}): DashboardSession {
  return {
    id: session.id,
    name: session.name,
    projectId: session.projectId,
    ...(session.assignedAgentId && {
      assignedAgentId: session.assignedAgentId,
    }),
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    ...(session.closeReason && { closeReason: session.closeReason }),
  };
}
