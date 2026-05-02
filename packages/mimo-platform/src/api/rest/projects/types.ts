/**
 * Request and response types for the projects internal API.
 *
 * These types define the data contracts for all project-related
 * endpoints in the internal API.
 */

import type { Project, Session } from "../../../domain/projects/repository.js";

/**
 * Project response format for API serialization.
 * Dates are serialized as ISO strings.
 */
export interface ProjectResponse {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: string;
  description?: string;
  credentialId?: string;
  sourceBranch?: string;
  newBranch?: string;
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
  repoUrl: string;
  repoType?: "git" | "fossil";
  description?: string;
  credentialId?: string;
  sourceBranch?: string;
  newBranch?: string;
  agentSubpath?: string;
  instructions?: string;
}

/**
 * Request body for updating a project.
 */
export interface UpdateProjectRequest {
  name?: string;
  repoUrl?: string;
  repoType?: "git" | "fossil";
  description?: string;
  credentialId?: string;
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
    repoUrl: project.repoUrl,
    repoType: project.repoType,
    owner: project.owner,
    createdAt: project.createdAt.toISOString(),
    ...(project.description && { description: project.description }),
    ...(project.credentialId && { credentialId: project.credentialId }),
    ...(project.sourceBranch && { sourceBranch: project.sourceBranch }),
    ...(project.newBranch && { newBranch: project.newBranch }),
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
