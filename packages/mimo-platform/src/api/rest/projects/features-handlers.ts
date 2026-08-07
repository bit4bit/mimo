// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request handlers for the project features internal API.
 *
 * Provides CRUD operations for the per-project feature list.
 * All handlers are pure functions that operate on injected dependencies
 * via the Hono context.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type {
  CreateFeatureRequest,
  UpdateFeatureRequest,
} from "./features-types.js";
import { toFeatureResponse } from "./features-types.js";

/**
 * Resolve and authorize the project for the authenticated user.
 * Returns the project or an error Response when not found / not owned.
 */
async function authorizeProject(
  c: InternalApiContext,
  id: string,
): Promise<{ ok: true; projectId: string } | Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }
  const mimoContext = c.get("mimoContext");
  const project = await mimoContext.repos.projects.findById(id);
  if (!project || project.owner !== user.username) {
    return c.json(errorResponse("Project not found", 404), 404);
  }
  return { ok: true, projectId: id };
}

/**
 * List features for a project.
 * GET /api/internal/projects/:id/features
 */
export async function listFeaturesHandler(
  c: InternalApiContext,
): Promise<Response> {
  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Project ID is required", 400), 400);
  }
  const auth = await authorizeProject(c, id);
  if (auth instanceof Response) return auth;

  const mimoContext = c.get("mimoContext");
  const features = await mimoContext.repos.features.list(auth.projectId);
  return c.json(successResponse({ features: features.map(toFeatureResponse) }));
}

/**
 * Create a feature for a project.
 * POST /api/internal/projects/:id/features
 */
export async function createFeatureHandler(
  c: InternalApiContext,
): Promise<Response> {
  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Project ID is required", 400), 400);
  }
  const auth = await authorizeProject(c, id);
  if (auth instanceof Response) return auth;

  const body = (await c.req.json()) as CreateFeatureRequest;
  if (!body.branchName || !body.description) {
    return c.json(
      errorResponse("branchName and description are required", 400),
      400,
    );
  }

  const mimoContext = c.get("mimoContext");
  const feature = await mimoContext.repos.features.add(auth.projectId, {
    branchName: body.branchName,
    description: body.description,
  });
  return c.json(successResponse({ feature: toFeatureResponse(feature) }), 201);
}

/**
 * Update a feature (branchName, description, and/or done toggle).
 * PUT /api/internal/projects/:id/features/:featureId
 */
export async function updateFeatureHandler(
  c: InternalApiContext,
): Promise<Response> {
  const id = c.req.param("id");
  const featureId = c.req.param("featureId");
  if (!id || !featureId) {
    return c.json(
      errorResponse("Project ID and feature ID are required", 400),
      400,
    );
  }
  const auth = await authorizeProject(c, id);
  if (auth instanceof Response) return auth;

  const body = (await c.req.json()) as UpdateFeatureRequest;
  const mimoContext = c.get("mimoContext");

  // Toggle done when `done` is provided.
  if (typeof body.done === "boolean") {
    const current = await mimoContext.repos.features.list(auth.projectId);
    const existing = current.find((f) => f.id === featureId);
    if (!existing) {
      return c.json(errorResponse("Feature not found", 404), 404);
    }
    // Flip to the requested state only if it differs.
    let updated = existing;
    if (existing.done !== body.done) {
      const toggled = await mimoContext.repos.features.toggleDone(
        auth.projectId,
        featureId,
      );
      if (!toggled) {
        return c.json(errorResponse("Feature not found", 404), 404);
      }
      updated = toggled;
    }
    // Apply branchName/description edits on top if provided.
    if (body.branchName !== undefined || body.description !== undefined) {
      const edited = await mimoContext.repos.features.edit(
        auth.projectId,
        featureId,
        {
          ...(body.branchName !== undefined && { branchName: body.branchName }),
          ...(body.description !== undefined && {
            description: body.description,
          }),
        },
      );
      if (!edited) {
        return c.json(errorResponse("Feature not found", 404), 404);
      }
      updated = edited;
    }
    return c.json(successResponse({ feature: toFeatureResponse(updated) }));
  }

  // Edit-only path (no done toggle).
  if (body.branchName === undefined && body.description === undefined) {
    return c.json(errorResponse("No updatable fields provided", 400), 400);
  }
  const edited = await mimoContext.repos.features.edit(
    auth.projectId,
    featureId,
    {
      ...(body.branchName !== undefined && { branchName: body.branchName }),
      ...(body.description !== undefined && { description: body.description }),
    },
  );
  if (!edited) {
    return c.json(errorResponse("Feature not found", 404), 404);
  }
  return c.json(successResponse({ feature: toFeatureResponse(edited) }));
}

/**
 * Delete a feature.
 * DELETE /api/internal/projects/:id/features/:featureId
 */
export async function deleteFeatureHandler(
  c: InternalApiContext,
): Promise<Response> {
  const id = c.req.param("id");
  const featureId = c.req.param("featureId");
  if (!id || !featureId) {
    return c.json(
      errorResponse("Project ID and feature ID are required", 400),
      400,
    );
  }
  const auth = await authorizeProject(c, id);
  if (auth instanceof Response) return auth;

  const mimoContext = c.get("mimoContext");
  await mimoContext.repos.features.delete(auth.projectId, featureId);
  return c.json(successResponse({ success: true }));
}
