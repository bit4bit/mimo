// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request handlers for the managed repositories internal API.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type {
  CreateRepositoryRequest,
  ReferencingProject,
  UpdateRepositoryRequest,
} from "./types.js";
import { toRepositoryResponse } from "./types.js";
import type { MimoContext } from "../../../infrastructure/context/mimo-context.js";

function getUser(c: InternalApiContext): { username: string } | null {
  return (c.get("user") as { username: string } | undefined) ?? null;
}

function isSshRepoUrl(repoUrl: string): boolean {
  return repoUrl.startsWith("git@") || repoUrl.startsWith("ssh://");
}

async function validateCredential(
  mimoContext: MimoContext,
  credentialId: string | undefined,
  username: string,
  repoUrl?: string,
): Promise<string | null> {
  if (!credentialId) {
    return null;
  }
  const credential = await mimoContext.repos.credentials.findById(
    credentialId,
    username,
  );
  if (!credential) {
    return "Credential not found or not owned by user";
  }
  if (repoUrl) {
    const expectedType = isSshRepoUrl(repoUrl) ? "ssh" : "https";
    if (credential.type !== expectedType) {
      return `Credential type does not match repository URL type. Expected ${expectedType.toUpperCase()} but got ${credential.type.toUpperCase()}`;
    }
  }
  return null;
}

async function findReferencingProjects(
  mimoContext: MimoContext,
  repoId: string,
  username: string,
): Promise<ReferencingProject[]> {
  const projects = await mimoContext.repos.projects.listByOwner(username);
  return projects
    .filter((project) =>
      project.repositories.some((entry) => entry.repoId === repoId),
    )
    .map((project) => ({ id: project.id, name: project.name }));
}

/**
 * List all managed repositories for the authenticated user.
 * GET /api/internal/repositories
 */
export async function listRepositoriesHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = getUser(c);
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const repositories = await mimoContext.repos.managedRepositories.findByOwner(
    user.username,
  );

  return c.json(
    successResponse({
      repositories: repositories.map(toRepositoryResponse),
    }),
  );
}

/**
 * Get a managed repository by id.
 * GET /api/internal/repositories/:id
 */
export async function getRepositoryHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = getUser(c);
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  const mimoContext = c.get("mimoContext");
  const repository = await mimoContext.repos.managedRepositories.findById(
    id,
    user.username,
  );

  if (!repository) {
    return c.json(errorResponse("Repository not found", 404), 404);
  }

  return c.json(
    successResponse({ repository: toRepositoryResponse(repository) }),
  );
}

/**
 * Create a managed repository.
 * POST /api/internal/repositories
 */
export async function createRepositoryHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = getUser(c);
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const body = (await c.req.json()) as CreateRepositoryRequest;

  if (!body.name || !body.repoUrl) {
    return c.json(
      errorResponse("Repository name and repoUrl are required", 400),
      400,
    );
  }
  if (body.repoType !== "git" && body.repoType !== "fossil") {
    return c.json(
      errorResponse("Repository type must be 'git' or 'fossil'", 400),
      400,
    );
  }

  const credentialError = await validateCredential(
    mimoContext,
    body.credentialId,
    user.username,
    body.repoUrl,
  );
  if (credentialError) {
    return c.json(errorResponse(credentialError, 400), 400);
  }

  try {
    const repository = await mimoContext.repos.managedRepositories.create({
      name: body.name,
      repoUrl: body.repoUrl,
      repoType: body.repoType,
      ...(body.credentialId ? { credentialId: body.credentialId } : {}),
      ...(body.clonePort !== undefined ? { clonePort: body.clonePort } : {}),
      owner: user.username,
    });

    return c.json(
      successResponse({ repository: toRepositoryResponse(repository) }),
      201,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create repository";
    return c.json(errorResponse(message, 400), 400);
  }
}

/**
 * Update a managed repository.
 * PUT /api/internal/repositories/:id
 */
export async function updateRepositoryHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = getUser(c);
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  const mimoContext = c.get("mimoContext");
  const existing = await mimoContext.repos.managedRepositories.findById(
    id,
    user.username,
  );
  if (!existing) {
    return c.json(errorResponse("Repository not found", 404), 404);
  }

  const body = (await c.req.json()) as UpdateRepositoryRequest;

  if (
    body.repoType !== undefined &&
    body.repoType !== "git" &&
    body.repoType !== "fossil"
  ) {
    return c.json(
      errorResponse("Repository type must be 'git' or 'fossil'", 400),
      400,
    );
  }

  if (body.credentialId) {
    const credentialError = await validateCredential(
      mimoContext,
      body.credentialId,
      user.username,
      body.repoUrl ?? existing.repoUrl,
    );
    if (credentialError) {
      return c.json(errorResponse(credentialError, 400), 400);
    }
  }

  try {
    const repository = await mimoContext.repos.managedRepositories.update(
      id,
      user.username,
      body,
    );
    return c.json(
      successResponse({ repository: toRepositoryResponse(repository) }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update repository";
    return c.json(errorResponse(message, 400), 400);
  }
}

/**
 * Delete a managed repository. Blocked while projects reference it.
 * DELETE /api/internal/repositories/:id
 */
export async function deleteRepositoryHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = getUser(c);
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Repository ID is required", 400), 400);
  }
  const mimoContext = c.get("mimoContext");
  const existing = await mimoContext.repos.managedRepositories.findById(
    id,
    user.username,
  );
  if (!existing) {
    return c.json(errorResponse("Repository not found", 404), 404);
  }

  const referencing = await findReferencingProjects(
    mimoContext,
    id,
    user.username,
  );
  if (referencing.length > 0) {
    const names = referencing.map((project) => project.name).join(", ");
    return c.json(
      errorResponse(
        `Repository is referenced by project(s): ${names}. Remove it from those projects first.`,
        409,
      ),
      409,
    );
  }

  await mimoContext.repos.managedRepositories.delete(id, user.username);
  return c.json(successResponse({ success: true }));
}

/**
 * List projects referencing a managed repository.
 * GET /api/internal/repositories/:id/referencing-projects
 */
export async function listReferencingProjectsHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = getUser(c);
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Repository ID is required", 400), 400);
  }
  const mimoContext = c.get("mimoContext");
  const existing = await mimoContext.repos.managedRepositories.findById(
    id,
    user.username,
  );
  if (!existing) {
    return c.json(errorResponse("Repository not found", 404), 404);
  }

  const projects = await findReferencingProjects(
    mimoContext,
    id,
    user.username,
  );
  return c.json(successResponse({ projects }));
}
