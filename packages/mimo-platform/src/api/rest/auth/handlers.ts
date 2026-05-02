/**
 * Request handlers for the auth internal API.
 *
 * Provides authentication operations (register, login, logout, verify).
 * All handlers are pure functions that operate on injected dependencies.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type { RegisterRequest, LoginRequest } from "./types.js";
import { toUserResponse } from "./types.js";

/**
 * Register a new user.
 * POST /api/internal/auth/register
 */
export async function registerHandler(
  c: InternalApiContext,
): Promise<Response> {
  const mimoContext = c.get("mimoContext");
  const body = (await c.req.json()) as RegisterRequest;

  // Validate required fields
  if (!body.username || !body.password) {
    return c.json(errorResponse("Username and password required", 400), 400);
  }

  // Check if username already exists
  const existingUser = await mimoContext.repos.users.getCredentials(
    body.username,
  );
  if (existingUser) {
    return c.json(errorResponse("Username already exists", 409), 409);
  }

  // Hash password and create user
  const passwordHash = await Bun.password.hash(body.password, {
    algorithm: "bcrypt",
    cost: 10,
  });

  const user = await mimoContext.repos.users.create(
    body.username,
    passwordHash,
  );

  return c.json(
    successResponse({
      user: toUserResponse(user),
    }),
    201,
  );
}

/**
 * Login a user and return a token.
 * POST /api/internal/auth/login
 */
export async function loginHandler(c: InternalApiContext): Promise<Response> {
  const mimoContext = c.get("mimoContext");
  const body = (await c.req.json()) as LoginRequest;

  // Validate required fields
  if (!body.username || !body.password) {
    return c.json(errorResponse("Username and password required", 400), 400);
  }

  // Get user credentials
  const credentials = await mimoContext.repos.users.getCredentials(
    body.username,
  );
  if (!credentials) {
    return c.json(errorResponse("Invalid credentials", 401), 401);
  }

  // Verify password
  const isValidPassword = await Bun.password.verify(
    body.password,
    credentials.passwordHash,
  );
  if (!isValidPassword) {
    return c.json(errorResponse("Invalid credentials", 401), 401);
  }

  // Generate token
  const token = await mimoContext.services.auth.generateToken(body.username);

  return c.json(
    successResponse({
      token,
      user: {
        username: body.username,
        createdAt: credentials.createdAt,
      },
    }),
  );
}

/**
 * Logout a user (token invalidation).
 * POST /api/internal/auth/logout
 */
export async function logoutHandler(c: InternalApiContext): Promise<Response> {
  const mimoContext = c.get("mimoContext");

  // Get token from Authorization header (since auth routes don't go through auth middleware)
  const authHeader = c.req.header("Authorization");
  const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (!token) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  // Verify token
  const payload = await mimoContext.services.auth.verifyToken(token);
  if (!payload) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  // Note: Token invalidation could be implemented here with a token blacklist
  // For now, we just return success - the client should discard the token
  return c.json(successResponse({ success: true }));
}

/**
 * Verify a token is valid.
 * GET /api/internal/auth/verify
 */
export async function verifyHandler(c: InternalApiContext): Promise<Response> {
  const mimoContext = c.get("mimoContext");

  // Get token from Authorization header
  const authHeader = c.req.header("Authorization");
  const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (!token) {
    return c.json(
      successResponse({
        valid: false,
      }),
    );
  }

  // Verify token
  const payload = await mimoContext.services.auth.verifyToken(token);

  if (!payload) {
    return c.json(
      successResponse({
        valid: false,
      }),
    );
  }

  return c.json(
    successResponse({
      valid: true,
      user: {
        username: payload.username,
        exp: payload.exp,
      },
    }),
  );
}
