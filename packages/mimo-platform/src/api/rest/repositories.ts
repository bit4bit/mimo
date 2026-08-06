// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Router setup for the managed repositories internal API.
 *
 * Routes are mounted under /api/internal/repositories.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import {
  listRepositoriesHandler,
  getRepositoryHandler,
  createRepositoryHandler,
  updateRepositoryHandler,
  deleteRepositoryHandler,
  listReferencingProjectsHandler,
} from "./repositories/handlers.js";

export function createRepositoriesInternalRouter(
  _mimoContext: MimoContext,
): Hono {
  const router = new Hono();

  router.get("/", listRepositoriesHandler);
  router.post("/", createRepositoryHandler);
  router.get("/:id", getRepositoryHandler);
  router.put("/:id", updateRepositoryHandler);
  router.delete("/:id", deleteRepositoryHandler);
  router.get("/:id/referencing-projects", listReferencingProjectsHandler);

  return router;
}
