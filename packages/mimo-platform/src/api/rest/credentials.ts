/**
 * Router setup for the credentials internal API.
 *
 * Defines routes for credential CRUD operations.
 * Routes are mounted under /api/internal/credentials.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import {
  listCredentialsHandler,
  getCredentialHandler,
  createCredentialHandler,
  updateCredentialHandler,
  deleteCredentialHandler,
} from "./credentials/handlers.js";

/**
 * Creates the credentials internal API router.
 *
 * Mounts all credential-related endpoints under /api/internal/credentials.
 * Authentication is expected to be handled by parent router middleware.
 *
 * @param _mimoContext - The MimoContext (passed for consistency, unused directly)
 * @returns Configured Hono router for credentials endpoints
 */
export function createCredentialsInternalRouter(
  _mimoContext: MimoContext,
): Hono {
  const router = new Hono();

  // List all credentials (without secrets)
  router.get("/", listCredentialsHandler);

  // Create new credential
  router.post("/", createCredentialHandler);

  // Get specific credential (with secrets)
  router.get("/:id", getCredentialHandler);

  // Update credential
  router.put("/:id", updateCredentialHandler);

  // Delete credential
  router.delete("/:id", deleteCredentialHandler);

  return router;
}
