/**
 * Request and response types for the config internal API.
 *
 * These types define the data contracts for all config-related
 * endpoints in the internal API.
 */

import type { Config } from "../../../domain/config/service.js";
import type { ValidationError } from "../../../domain/config/validator.js";

/**
 * Get configuration response.
 */
export interface GetConfigResponse {
  config: Config;
}

/**
 * Update configuration request body.
 */
export interface UpdateConfigRequest {
  theme?: "dark" | "light";
  fontSize?: number;
  fontFamily?: string;
  sessionKeybindings?: Record<string, string | undefined>;
  globalKeybindings?: Record<string, string | undefined>;
  chatFileExtensions?: string[];
  summary?: { prompt?: string };
}

/**
 * Update configuration response.
 */
export interface UpdateConfigResponse {
  config: Config;
}

/**
 * Reset configuration response.
 */
export interface ResetConfigResponse {
  config: Config;
}

/**
 * Validation error response.
 */
export interface ConfigValidationErrorResponse {
  errors: ValidationError[];
}
