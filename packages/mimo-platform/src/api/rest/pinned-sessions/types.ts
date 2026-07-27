// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Types for the pinned-sessions internal API.
 */

export interface CreatePinRequest {
  sessionId: string;
  projectId: string;
}

export interface ReorderPinsRequest {
  order: string[];
}

export interface PinListEntryResponse {
  sessionId: string;
  projectId: string;
  sessionTitle: string | null;
  branch: string | null;
  /** True when the referenced session no longer exists on disk. */
  stale: boolean;
}

export interface PinListResponse {
  pins: PinListEntryResponse[];
}