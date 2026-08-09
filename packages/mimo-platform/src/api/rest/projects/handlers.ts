// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request handlers for the projects internal API.
 *
 * Provides CRUD operations and session listing for projects.
 * All handlers are pure functions that operate on injected dependencies.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type { CreateProjectRequest, UpdateProjectRequest } from "./types.js";
import { toProjectResponse, toSessionResponse } from "./types.js";
import {
  validateProjectRepositories,
  type ProjectRepositoryEntry,
} from "../../../domain/projects/repository.js";
import { logger } from "../../../logger.js";
import type { MimoContext } from "../../../infrastructure/context/mimo-context.js";
import type { Credential } from "../../../domain/credentials/repository.js";
import type { ManagedRepository } from "../../../domain/repositories/repository.js";

function isSshRepoUrl(repoUrl: string): boolean {
  return repoUrl.startsWith("git@") || repoUrl.startsWith("ssh://");
}

/**
 * Validates that project repository entries reference managed repositories.
 * Inline connection fields (repoUrl, repoType, credentialId, clonePort) are
 * rejected; entries must carry a repoId pointing to a managed repository
 * owned by the user.
 */
async function validateRepositoryReferences(
  mimoContext: MimoContext,
  repositories: ProjectRepositoryEntry[] | undefined,
  owner: string,
): Promise<{ error: string } | { resolved: Map<string, ManagedRepository> }> {
  const resolved = new Map<string, ManagedRepository>();
  for (const repo of repositories ?? []) {
    if (
      repo.repoUrl !== undefined ||
      repo.repoType !== undefined ||
      repo.credentialId !== undefined ||
      repo.clonePort !== undefined
    ) {
      return {
        error:
          "Project repositories must reference a managed repository by repoId; inline repoUrl/repoType/credentialId/clonePort are no longer accepted",
      };
    }
    if (!repo.repoId) {
      return {
        error: `Project repository "${repo.name}" must reference a managed repository by repoId`,
      };
    }
    const managed = await mimoContext.repos.managedRepositories.findById(
      repo.repoId,
      owner,
    );
    if (!managed) {
      return {
        error: `Referenced repository not found for "${repo.name}"`,
      };
    }
    resolved.set(repo.id, managed);
  }
  return { resolved };
}

async function validateRepositoryCredentials(
  mimoContext: MimoContext,
  repositories: ProjectRepositoryEntry[] | undefined,
  owner: string,
): Promise<string | null> {
  for (const repo of repositories ?? []) {
    if (!repo.credentialId) {
      continue;
    }
    const credential = await mimoContext.repos.credentials.findById(
      repo.credentialId,
      owner,
    );
    if (!credential) {
      return "Selected credential not found";
    }
    const expectedType = isSshRepoUrl(repo.repoUrl ?? "") ? "ssh" : "https";
    if (credential.type !== expectedType) {
      return `Credential type does not match repository URL type. Expected ${expectedType.toUpperCase()} but got ${credential.type.toUpperCase()}`;
    }
  }
  return null;
}

/**
 * List all projects for the authenticated user.
 * GET /api/internal/projects
 */
export async function listProjectsHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const projects = await mimoContext.repos.projects.listByOwner(user.username);

  return c.json(
    successResponse({
      projects: projects.map(toProjectResponse),
    }),
  );
}

/**
 * Get a specific project by ID.
 * GET /api/internal/projects/:id
 */
export async function getProjectHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Project ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const project = await mimoContext.repos.projects.findById(id);

  if (!project) {
    return c.json(errorResponse("Project not found", 404), 404);
  }

  if (project.owner !== user.username) {
    return c.json(errorResponse("Project not found", 404), 404);
  }

  return c.json(
    successResponse({
      project: toProjectResponse(project),
    }),
  );
}

/**
 * Create a new project.
 * POST /api/internal/projects
 */
export async function createProjectHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const body = (await c.req.json()) as CreateProjectRequest;

  let repositories: ProjectRepositoryEntry[] | undefined;
  try {
    repositories = validateProjectRepositories(body.repositories);
  } catch (error) {
    return c.json(
      errorResponse(
        error instanceof Error ? error.message : "Invalid repositories",
        400,
      ),
      400,
    );
  }
  if (!body.name) {
    return c.json(errorResponse("Project name is required", 400), 400);
  }

  if (!repositories) {
    return c.json(
      errorResponse("Project repositories must be a non-empty array", 400),
      400,
    );
  }

  const referenceResult = await validateRepositoryReferences(
    mimoContext,
    repositories,
    user.username,
  );
  if ("error" in referenceResult) {
    return c.json(errorResponse(referenceResult.error, 400), 400);
  }
  const resolvedRepositories = referenceResult.resolved;

  // Validate description length
  if (body.description && body.description.length > 500) {
    return c.json(
      errorResponse("Description must be 500 characters or less", 400),
      400,
    );
  }

  const repositoriesCredentialError = await validateRepositoryCredentials(
    mimoContext,
    repositories.filter((repo) => !repo.repoId),
    user.username,
  );
  if (repositoriesCredentialError) {
    return c.json(errorResponse(repositoriesCredentialError, 400), 400);
  }

  try {
    const project = await mimoContext.repos.projects.create({
      name: body.name,
      owner: user.username,
      repositories,
      description: body.description,
      agentSubpath: body.agentSubpath?.trim() || undefined,
      ...(body.instructions !== undefined && {
        instructions: body.instructions,
      }),
    });

    const repositoryCredentials = new Map<string, Credential>();
    for (const repo of project.repositories) {
      const managed = resolvedRepositories.get(repo.id);
      const credentialId = managed?.credentialId ?? repo.credentialId;
      if (!credentialId) continue;
      const credential = await mimoContext.repos.credentials.findById(
        credentialId,
        project.owner,
      );
      if (credential) {
        repositoryCredentials.set(repo.id, credential);
      }
    }

    // By default, block project creation on cache pre-warm so first session
    // creation does not pay full clone cost for large repositories.
    const warmCacheSync = body.warmCacheSync ?? true;

    const runPrewarm = async (): Promise<{
      success: boolean;
      error?: string;
    }> => {
      for (const repo of project.repositories) {
        const managed = resolvedRepositories.get(repo.id);
        const repoUrl = managed?.repoUrl ?? repo.repoUrl;
        const repoType = managed?.repoType ?? repo.repoType ?? "git";
        if (!repoUrl) {
          return {
            success: false,
            error: `Repository "${repo.name}" has no URL (missing managed repository reference)`,
          };
        }
        logger.info("[projects] starting cache pre-warm", {
          projectId: project.id,
          repoId: repo.id,
          repoUrl,
          repoType,
          branch: repo.sourceBranch ?? "default",
          sync: warmCacheSync,
        });
        const start = Date.now();
        const refreshResult =
          await mimoContext.services.projectVcsCache.refresh({
            projectId: project.id,
            repoId: repo.id,
            repoUrl,
            repoType,
            credential: repositoryCredentials.get(repo.id),
            clonePort: managed?.clonePort ?? repo.clonePort ?? undefined,
            branch: repo.sourceBranch ?? undefined,
          });
        const durationMs = Date.now() - start;
        if (!refreshResult.success) {
          logger.warn("[projects] cache pre-warm failed", {
            projectId: project.id,
            repoId: repo.id,
            branch: repo.sourceBranch ?? "default",
            durationMs,
            error: refreshResult.error,
          });
          return refreshResult;
        }
        logger.info("[projects] cache pre-warm finished", {
          projectId: project.id,
          repoId: repo.id,
          branch: repo.sourceBranch ?? "default",
          durationMs,
        });
      }
      return { success: true };
    };

    if (warmCacheSync) {
      const refreshResult = await runPrewarm();
      if (!refreshResult.success) {
        await mimoContext.repos.projects.delete(project.id);
        return c.json(
          errorResponse(
            `Project cache pre-warm failed: ${refreshResult.error ?? "unknown error"}`,
            500,
          ),
          500,
        );
      }
    } else {
      // Optional background pre-warm.
      queueMicrotask(async () => {
        try {
          await runPrewarm();
        } catch (error) {
          logger.warn("[projects] cache pre-warm threw", {
            projectId: project.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }

    return c.json(
      successResponse({
        project: toProjectResponse(project),
      }),
      201,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create project";
    return c.json(errorResponse(message, 500), 500);
  }
}

/**
 * Update a project.
 * PUT /api/internal/projects/:id
 */
export async function updateProjectHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Project ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const project = await mimoContext.repos.projects.findById(id);

  if (!project) {
    return c.json(errorResponse("Project not found", 404), 404);
  }

  if (project.owner !== user.username) {
    return c.json(errorResponse("Project not found", 404), 404);
  }

  const body = (await c.req.json()) as UpdateProjectRequest;

  let repositories: ProjectRepositoryEntry[] | undefined;
  try {
    repositories = validateProjectRepositories(body.repositories);
  } catch (error) {
    return c.json(
      errorResponse(
        error instanceof Error ? error.message : "Invalid repositories",
        400,
      ),
      400,
    );
  }

  if (body.repositories) {
    const referenceResult = await validateRepositoryReferences(
      mimoContext,
      repositories,
      user.username,
    );
    if ("error" in referenceResult) {
      return c.json(errorResponse(referenceResult.error, 400), 400);
    }
  }

  const repositoriesCredentialError = await validateRepositoryCredentials(
    mimoContext,
    repositories?.filter((repo) => !repo.repoId),
    user.username,
  );
  if (repositoriesCredentialError) {
    return c.json(errorResponse(repositoriesCredentialError, 400), 400);
  }

  // Validate description length
  if (body.description && body.description.length > 500) {
    return c.json(
      errorResponse("Description must be 500 characters or less", 400),
      400,
    );
  }

  try {
    const updated = await mimoContext.repos.projects.update(id, {
      name: body.name,
      ...(repositories && { repositories }),
      description: body.description,
      ...(body.instructions !== undefined && {
        instructions: body.instructions,
      }),
    });

    return c.json(
      successResponse({
        project: toProjectResponse(updated),
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update project";
    return c.json(errorResponse(message, 500), 500);
  }
}

/**
 * Delete a project.
 * DELETE /api/internal/projects/:id
 */
export async function deleteProjectHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Project ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const project = await mimoContext.repos.projects.findById(id);

  if (!project) {
    return c.json(errorResponse("Project not found", 404), 404);
  }

  if (project.owner !== user.username) {
    return c.json(errorResponse("Project not found", 404), 404);
  }

  try {
    await mimoContext.services.projectDeletion.deleteProjectCascade({
      id: project.id,
      owner: project.owner,
    });
  } catch (error) {
    logger.error("[projects] delete cascade failed", {
      projectId: project.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      errorResponse(
        error instanceof Error
          ? error.message
          : "Failed to delete project",
        500,
      ),
      500,
    );
  }

  return c.json(successResponse({ success: true }));
}

/**
 * List sessions for a project.
 * GET /api/internal/projects/:id/sessions
 */
export async function listProjectSessionsHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Project ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const project = await mimoContext.repos.projects.findById(id);

  if (!project) {
    return c.json(errorResponse("Project not found", 404), 404);
  }

  if (project.owner !== user.username) {
    return c.json(errorResponse("Project not found", 404), 404);
  }

  const sessions = await mimoContext.repos.sessions.listByProject(id);

  return c.json(
    successResponse({
      sessions: sessions.map(toSessionResponse),
    }),
  );
}
