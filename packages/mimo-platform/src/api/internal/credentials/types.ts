/**
 * Request and response types for the credentials internal API.
 *
 * These types define the data contracts for all credential-related
 * endpoints in the internal API.
 */

import type {
  Credential,
  CredentialType,
} from "../../../credentials/repository.js";

/**
 * Credential response format for list endpoint (without secrets).
 */
export interface CredentialListResponse {
  id: string;
  name: string;
  type: CredentialType;
  owner: string;
  createdAt: string;
  // HTTPS specific (no password)
  username?: string;
}

/**
 * Credential response format for get/create/update endpoints (with secrets).
 */
export interface CredentialResponse extends CredentialListResponse {
  // HTTPS specific
  password?: string;
  // SSH specific
  privateKey?: string;
}

/**
 * Request body for creating an HTTPS credential.
 */
export interface CreateHttpsCredentialRequest {
  name: string;
  type: "https";
  username: string;
  password: string;
}

/**
 * Request body for creating an SSH credential.
 */
export interface CreateSshCredentialRequest {
  name: string;
  type: "ssh";
  privateKey: string;
}

/**
 * Union type for create credential request.
 */
export type CreateCredentialRequest =
  | CreateHttpsCredentialRequest
  | CreateSshCredentialRequest;

/**
 * Request body for updating an HTTPS credential.
 */
export interface UpdateHttpsCredentialRequest {
  name?: string;
  username?: string;
  password?: string;
}

/**
 * Request body for updating an SSH credential.
 */
export interface UpdateSshCredentialRequest {
  name?: string;
  privateKey?: string;
}

/**
 * Union type for update credential request.
 */
export type UpdateCredentialRequest =
  | UpdateHttpsCredentialRequest
  | UpdateSshCredentialRequest;

/**
 * List credentials response.
 */
export interface ListCredentialsResponse {
  credentials: CredentialListResponse[];
}

/**
 * Get credential response.
 */
export interface GetCredentialResponse {
  credential: CredentialResponse;
}

/**
 * Create credential response.
 */
export interface CreateCredentialResponse {
  credential: CredentialResponse;
}

/**
 * Update credential response.
 */
export interface UpdateCredentialResponse {
  credential: CredentialResponse;
}

/**
 * Delete credential response.
 */
export interface DeleteCredentialResponse {
  success: boolean;
}

/**
 * Converts a Credential entity to list response format (without secrets).
 */
export function toCredentialListResponse(
  credential: Credential,
): CredentialListResponse {
  const base: CredentialListResponse = {
    id: credential.id,
    name: credential.name,
    type: credential.type,
    owner: credential.owner,
    createdAt: credential.createdAt.toISOString(),
  };

  if (credential.type === "https") {
    base.username = credential.username;
  }

  return base;
}

/**
 * Converts a Credential entity to full response format (with secrets).
 */
export function toCredentialResponse(
  credential: Credential,
): CredentialResponse {
  const base = toCredentialListResponse(credential);

  if (credential.type === "https") {
    return {
      ...base,
      password: credential.password,
    };
  } else {
    return {
      ...base,
      privateKey: credential.privateKey,
    };
  }
}
