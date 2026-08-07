// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request and response types for the features internal API.
 */

import type { Feature } from "../../../domain/features/repository.js";

/**
 * Feature response format for API serialization.
 */
export interface FeatureResponse {
  id: string;
  branchName: string;
  description: string;
  done: boolean;
  createdAt: string;
}

/**
 * Request body for creating a new feature.
 */
export interface CreateFeatureRequest {
  branchName: string;
  description: string;
}

/**
 * Request body for updating a feature. All fields optional; `done`
 * toggles the done flag.
 */
export interface UpdateFeatureRequest {
  branchName?: string;
  description?: string;
  done?: boolean;
}

/**
 * List features response.
 */
export interface ListFeaturesResponse {
  features: FeatureResponse[];
}

/**
 * Converts a Feature entity to API response format.
 */
export function toFeatureResponse(feature: Feature): FeatureResponse {
  return {
    id: feature.id,
    branchName: feature.branchName,
    description: feature.description,
    done: feature.done,
    createdAt: feature.createdAt,
  };
}
