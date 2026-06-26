// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request handlers for the config internal API.
 *
 * Provides get, update, and reset operations for configuration.
 * All handlers are pure functions that operate on injected dependencies.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type { UpdateConfigRequest } from "./types.js";
import { configValidator } from "../../../domain/config/validator.js";
import { defaultConfig } from "../../../domain/config/service.js";

/**
 * Get the current configuration.
 * GET /api/internal/config
 */
export async function getConfigHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const config = await mimoContext.services.config.load();

  return c.json(
    successResponse({
      config,
    }),
  );
}

/**
 * Update the configuration (with validation).
 * PUT /api/internal/config
 */
export async function updateConfigHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const body = (await c.req.json()) as UpdateConfigRequest;

  // Get existing config to preserve values not sent in request
  const existingConfig = await mimoContext.services.config.load();

  // Merge existing config with updates
  const newConfig = {
    ...existingConfig,
    ...body,
  };

  // Validate the config
  const validation = configValidator.validate(newConfig);

  if (validation.errors.length > 0) {
    return c.json(errorResponse("Validation failed", 400), 400);
  }

  // Save the config
  await mimoContext.services.config.save(validation.sanitized);

  return c.json(
    successResponse({
      config: validation.sanitized,
    }),
  );
}

/**
 * Reset configuration to defaults.
 * POST /api/internal/config/reset
 */
export async function resetConfigHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  await mimoContext.services.config.save(defaultConfig);

  return c.json(
    successResponse({
      config: defaultConfig,
    }),
  );
}
