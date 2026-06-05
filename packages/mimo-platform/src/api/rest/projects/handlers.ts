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
import { logger } from "../../../logger.js";

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

  // Validate required fields
  if (!body.name || !body.repoUrl) {
    return c.json(
      errorResponse("Name and repository URL are required", 400),
      400,
    );
  }

  // Validate repo type
  const repoType = body.repoType ?? "git";
  if (repoType !== "git" && repoType !== "fossil") {
    return c.json(
      errorResponse("Repository type must be 'git' or 'fossil'", 400),
      400,
    );
  }

  // Validate description length
  if (body.description && body.description.length > 500) {
    return c.json(
      errorResponse("Description must be 500 characters or less", 400),
      400,
    );
  }

  // Validate clonePort if provided
  if (body.clonePort !== undefined && body.clonePort !== null) {
    if (
      !Number.isInteger(body.clonePort) ||
      body.clonePort < 1 ||
      body.clonePort > 65535
    ) {
      return c.json(
        errorResponse("SSH port must be an integer between 1 and 65535", 400),
        400,
      );
    }
  }

  // Validate credential if provided
  if (body.credentialId) {
    const credential = await mimoContext.repos.credentials.findById(
      body.credentialId,
      user.username,
    );
    if (!credential) {
      return c.json(errorResponse("Selected credential not found", 400), 400);
    }

    // Validate credential type matches URL type
    const isSshUrl =
      body.repoUrl.startsWith("git@") || body.repoUrl.startsWith("ssh://");
    const expectedType = isSshUrl ? "ssh" : "https";
    if (credential.type !== expectedType) {
      return c.json(
        errorResponse(
          `Credential type does not match repository URL type. Expected ${expectedType.toUpperCase()} but got ${credential.type.toUpperCase()}`,
          400,
        ),
        400,
      );
    }
  }

  try {
    const project = await mimoContext.repos.projects.create({
      name: body.name,
      repoUrl: body.repoUrl,
      repoType: repoType as "git" | "fossil",
      owner: user.username,
      description: body.description,
      credentialId: body.credentialId,
      sourceBranch: body.sourceBranch,
      newBranch: body.newBranch,
      agentSubpath: body.agentSubpath?.trim() || undefined,
      ...(body.instructions !== undefined && {
        instructions: body.instructions,
      }),
      ...(body.clonePort != null && { clonePort: body.clonePort }),
    });

    const credential = project.credentialId
      ? await mimoContext.repos.credentials.findById(
          project.credentialId,
          project.owner,
        )
      : undefined;

    // By default, block project creation on cache pre-warm so first session
    // creation does not pay full clone cost for large repositories.
    const warmCacheSync = body.warmCacheSync ?? true;

    const runPrewarm = async (): Promise<{
      success: boolean;
      error?: string;
    }> =>
      mimoContext.services.projectVcsCache.refresh({
        projectId: project.id,
        repoUrl: project.repoUrl,
        repoType: project.repoType,
        credential: credential ?? undefined,
        clonePort: project.clonePort ?? undefined,
      });

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
          const refreshResult = await runPrewarm();
          if (!refreshResult.success) {
            logger.warn("[projects] cache pre-warm failed", {
              projectId: project.id,
              error: refreshResult.error,
            });
          }
        } catch (error) {
          logger.warn("[projects] cache pre-warm failed", {
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

  // Validate clonePort if provided
  if (body.clonePort !== undefined && body.clonePort !== null) {
    if (
      !Number.isInteger(body.clonePort) ||
      body.clonePort < 1 ||
      body.clonePort > 65535
    ) {
      return c.json(
        errorResponse("SSH port must be an integer between 1 and 65535", 400),
        400,
      );
    }
  }

  // Validate repo type if provided
  if (body.repoType && body.repoType !== "git" && body.repoType !== "fossil") {
    return c.json(
      errorResponse("Repository type must be 'git' or 'fossil'", 400),
      400,
    );
  }

  // Validate description length
  if (body.description && body.description.length > 500) {
    return c.json(
      errorResponse("Description must be 500 characters or less", 400),
      400,
    );
  }

  // Validate credential if provided
  if (body.credentialId) {
    const credential = await mimoContext.repos.credentials.findById(
      body.credentialId,
      user.username,
    );
    if (!credential) {
      return c.json(errorResponse("Selected credential not found", 400), 400);
    }

    // Get the URL to validate against (use existing or new)
    const repoUrl = body.repoUrl ?? project.repoUrl;
    const isSshUrl = repoUrl.startsWith("git@") || repoUrl.startsWith("ssh://");
    const expectedType = isSshUrl ? "ssh" : "https";
    if (credential.type !== expectedType) {
      return c.json(
        errorResponse(
          `Credential type does not match repository URL type. Expected ${expectedType.toUpperCase()} but got ${credential.type.toUpperCase()}`,
          400,
        ),
        400,
      );
    }
  }

  try {
    const updated = await mimoContext.repos.projects.update(id, {
      name: body.name,
      repoUrl: body.repoUrl,
      repoType: body.repoType,
      description: body.description,
      credentialId: body.credentialId,
      ...(body.instructions !== undefined && {
        instructions: body.instructions,
      }),
      ...("clonePort" in body && { clonePort: body.clonePort }),
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

  await mimoContext.services.projectVcsCache.clear(
    project.id,
    project.repoType,
  );
  await mimoContext.repos.projects.delete(id);

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
