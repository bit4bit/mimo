/**
 * Request handlers for the credentials internal API.
 *
 * Provides CRUD operations for credentials.
 * All handlers are pure functions that operate on injected dependencies.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type {
  CreateCredentialRequest,
  UpdateCredentialRequest,
} from "./types.js";
import { toCredentialListResponse, toCredentialResponse } from "./types.js";
import type { CredentialType } from "../../../domain/credentials/repository.js";

/**
 * List all credentials for the authenticated user (without secrets).
 * GET /api/internal/credentials
 */
export async function listCredentialsHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const credentials = await mimoContext.repos.credentials.findByOwner(
    user.username,
  );

  return c.json(
    successResponse({
      credentials: credentials.map(toCredentialListResponse),
    }),
  );
}

/**
 * Get a specific credential by ID (with secrets for editing).
 * GET /api/internal/credentials/:id
 */
export async function getCredentialHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Credential ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const credential = await mimoContext.repos.credentials.findById(
    id,
    user.username,
  );

  if (!credential) {
    return c.json(errorResponse("Credential not found", 404), 404);
  }

  return c.json(
    successResponse({
      credential: toCredentialResponse(credential),
    }),
  );
}

/**
 * Create a new credential (HTTPS or SSH).
 * POST /api/internal/credentials
 */
export async function createCredentialHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const body = (await c.req.json()) as CreateCredentialRequest;

  // Validate required fields
  if (!body.name) {
    return c.json(errorResponse("Credential name is required", 400), 400);
  }

  if (!body.type || (body.type !== "https" && body.type !== "ssh")) {
    return c.json(errorResponse("Type must be 'https' or 'ssh'", 400), 400);
  }

  try {
    let credential;

    if (body.type === "https") {
      if (!body.username || !body.password) {
        return c.json(
          errorResponse(
            "Username and password are required for HTTPS credentials",
            400,
          ),
          400,
        );
      }

      credential = await mimoContext.repos.credentials.create({
        name: body.name,
        type: "https",
        username: body.username,
        password: body.password,
        owner: user.username,
      });
    } else {
      // SSH credential
      if (!body.privateKey) {
        return c.json(
          errorResponse("Private key is required for SSH credentials", 400),
          400,
        );
      }

      credential = await mimoContext.repos.credentials.create({
        name: body.name,
        type: "ssh",
        privateKey: body.privateKey,
        owner: user.username,
      });
    }

    return c.json(
      successResponse({
        credential: toCredentialResponse(credential),
      }),
      201,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create credential";
    return c.json(errorResponse(message, 400), 400);
  }
}

/**
 * Update an existing credential.
 * PUT /api/internal/credentials/:id
 */
export async function updateCredentialHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Credential ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const credential = await mimoContext.repos.credentials.findById(
    id,
    user.username,
  );

  if (!credential) {
    return c.json(errorResponse("Credential not found", 404), 404);
  }

  const body = (await c.req.json()) as UpdateCredentialRequest;

  // Build updates - include the type to match expected signature
  const updates: {
    name: string;
    type: CredentialType;
    username?: string;
    password?: string;
    privateKey?: string;
  } = {
    name: body.name ?? credential.name,
    type: credential.type,
  };

  if (credential.type === "https") {
    const httpsBody = body as {
      username?: string;
      password?: string;
    };
    if (httpsBody.username !== undefined) {
      updates.username = httpsBody.username;
    }
    if (httpsBody.password !== undefined) {
      updates.password = httpsBody.password;
    }
  } else {
    // SSH credential
    const sshBody = body as { privateKey?: string };
    if (sshBody.privateKey !== undefined) {
      updates.privateKey = sshBody.privateKey;
    }
  }

  try {
    const updated = await mimoContext.repos.credentials.update(
      id,
      user.username,
      updates,
    );

    return c.json(
      successResponse({
        credential: toCredentialResponse(updated),
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update credential";
    return c.json(errorResponse(message, 400), 400);
  }
}

/**
 * Delete a credential.
 * DELETE /api/internal/credentials/:id
 */
export async function deleteCredentialHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json(errorResponse("Credential ID is required", 400), 400);
  }

  const mimoContext = c.get("mimoContext");
  const credential = await mimoContext.repos.credentials.findById(
    id,
    user.username,
  );

  if (!credential) {
    return c.json(errorResponse("Credential not found", 404), 404);
  }

  await mimoContext.repos.credentials.delete(id, user.username);

  return c.json(successResponse({ success: true }));
}
