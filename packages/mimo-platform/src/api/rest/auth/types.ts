// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request and response types for the auth internal API.
 *
 * These types define the data contracts for all authentication-related
 * endpoints in the internal API.
 */

import type { User } from "../../../domain/auth/user.js";

/**
 * Request body for user registration.
 */
export interface RegisterRequest {
  username: string;
  password: string;
}

/**
 * Request body for user login.
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Response for successful registration.
 */
export interface RegisterResponse {
  user: {
    username: string;
    createdAt: string;
  };
}

/**
 * Response for successful login.
 */
export interface LoginResponse {
  token: string;
  user: {
    username: string;
    createdAt: string;
  };
}

/**
 * Response for logout.
 */
export interface LogoutResponse {
  success: boolean;
}

/**
 * Response for token verification.
 */
export interface VerifyResponse {
  valid: boolean;
  user?: {
    username: string;
    exp?: number;
  };
}

/**
 * Converts a User entity to API response format.
 */
export function toUserResponse(user: User): {
  username: string;
  createdAt: string;
} {
  return {
    username: user.username,
    createdAt: user.createdAt.toISOString(),
  };
}
