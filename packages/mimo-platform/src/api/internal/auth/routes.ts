/**
 * Router setup for the auth internal API.
 *
 * Defines routes for authentication operations.
 * Routes are mounted under /api/internal/auth.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../../context/mimo-context.js";
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  verifyHandler,
} from "./handlers.js";

/**
 * Creates the auth internal API router.
 *
 * Mounts all auth-related endpoints under /api/internal/auth.
 * Note: Register and login do not require authentication (they create it).
 * Logout and verify require authentication.
 *
 * @param _mimoContext - The MimoContext (passed for consistency, unused directly)
 * @returns Configured Hono router for auth endpoints
 */
export function createAuthInternalRouter(_mimoContext: MimoContext): Hono {
  const router = new Hono();

  // Register new user (no auth required)
  router.post("/register", registerHandler);

  // Login user (no auth required)
  router.post("/login", loginHandler);

  // Logout user (requires auth)
  router.post("/logout", logoutHandler);

  // Verify token (no auth required - checks token validity)
  router.get("/verify", verifyHandler);

  return router;
}
