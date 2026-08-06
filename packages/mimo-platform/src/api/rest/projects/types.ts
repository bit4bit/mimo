// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request and response types for the projects internal API.
 *
 * These types define the data contracts for all project-related
 * endpoints in the internal API.
 */

import type {
  Project,
  ProjectRepositoryEntry,
} from "../../../domain/projects/repository.js";
import type { Session } from "../../../domain/sessions/repository.js";

/**
 * Project response format for API serialization.
 * Dates are serialized as ISO strings.
 */
export interface ProjectResponse {
  id: string;
  name: string;
  owner: string;
  createdAt: string;
  repositories: ProjectRepositoryEntry[];
  description?: string;
  agentSubpath?: string;
  instructions?: string;
}

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
  closeReason?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new project.
 */
export interface CreateProjectRequest {
  name: string;
  repositories?: ProjectRepositoryEntry[];
  description?: string;
  agentSubpath?: string;
  instructions?: string;
  warmCacheSync?: boolean;
}

/**
 * Request body for updating a project.
 */
export interface UpdateProjectRequest {
  name?: string;
  repositories?: ProjectRepositoryEntry[];
  description?: string;
  instructions?: string;
}

/**
 * List projects response.
 */
export interface ListProjectsResponse {
  projects: ProjectResponse[];
}

/**
 * Get project response.
 */
export interface GetProjectResponse {
  project: ProjectResponse;
}

/**
 * List project sessions response.
 */
export interface ListProjectSessionsResponse {
  sessions: SessionResponse[];
}

/**
 * Converts a Project entity to API response format.
 */
export function toProjectResponse(project: Project): ProjectResponse {
  return {
    id: project.id,
    name: project.name,
    owner: project.owner,
    createdAt: project.createdAt.toISOString(),
    repositories: project.repositories,
    ...(project.description && { description: project.description }),
    ...(project.agentSubpath && { agentSubpath: project.agentSubpath }),
    ...(project.instructions && { instructions: project.instructions }),
  };
}

/**
 * Converts a Session entity to API response format.
 * Only includes fields needed for project session listings.
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
    ...(session.closeReason && { closeReason: session.closeReason }),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
