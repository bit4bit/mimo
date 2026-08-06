// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Request and response types for the managed repositories internal API.
 */

import type {
  ManagedRepository,
  ManagedRepoType,
} from "../../../domain/repositories/repository.js";

export interface RepositoryResponse {
  id: string;
  name: string;
  repoUrl: string;
  repoType: ManagedRepoType;
  credentialId?: string;
  clonePort?: number;
  owner: string;
  createdAt: string;
}

export interface CreateRepositoryRequest {
  name: string;
  repoUrl: string;
  repoType: ManagedRepoType;
  credentialId?: string;
  clonePort?: number;
}

export interface UpdateRepositoryRequest {
  name?: string;
  repoUrl?: string;
  repoType?: ManagedRepoType;
  credentialId?: string | null;
  clonePort?: number | null;
}

export interface ReferencingProject {
  id: string;
  name: string;
}

export function toRepositoryResponse(
  repository: ManagedRepository,
): RepositoryResponse {
  return {
    id: repository.id,
    name: repository.name,
    repoUrl: repository.repoUrl,
    repoType: repository.repoType,
    ...(repository.credentialId
      ? { credentialId: repository.credentialId }
      : {}),
    ...(repository.clonePort !== undefined
      ? { clonePort: repository.clonePort }
      : {}),
    owner: repository.owner,
    createdAt: repository.createdAt.toISOString(),
  };
}
