// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Router setup for the projects internal API.
 *
 * Defines routes for project CRUD operations and session listing.
 * Routes are mounted under /api/internal/projects.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import {
  listProjectsHandler,
  getProjectHandler,
  createProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
  listProjectSessionsHandler,
} from "./projects/handlers.js";

/**
 * Creates the projects internal API router.
 *
 * Mounts all project-related endpoints under /api/internal/projects.
 * Authentication is expected to be handled by parent router middleware.
 *
 * @param _mimoContext - The MimoContext (passed for consistency, unused directly)
 * @returns Configured Hono router for projects endpoints
 */
export function createProjectsInternalRouter(_mimoContext: MimoContext): Hono {
  const router = new Hono();

  // List all projects
  router.get("/", listProjectsHandler);

  // Create new project
  router.post("/", createProjectHandler);

  // Get specific project
  router.get("/:id", getProjectHandler);

  // Update project
  router.put("/:id", updateProjectHandler);

  // Delete project
  router.delete("/:id", deleteProjectHandler);

  // List project sessions
  router.get("/:id/sessions", listProjectSessionsHandler);

  return router;
}
