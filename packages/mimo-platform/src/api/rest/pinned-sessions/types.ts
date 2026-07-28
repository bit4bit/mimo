// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Types for the pinned-sessions internal API.
 */

export interface CreatePinRequest {
  sessionId: string;
  projectId: string;
  /**
   * Optional group label. When omitted or empty after trim, defaults to
   * the literal string `"Ungrouped"`. The same session may be pinned
   * under multiple different groups (each becomes its own row).
   */
  group?: string;
}

export interface ReorderPinsRequest {
  order: string[];
}

export interface PinListEntryResponse {
  sessionId: string;
  projectId: string;
  sessionTitle: string | null;
  branch: string | null;
  /** The entry's group label, in the user's typed casing. */
  group: string;
  /** True when the referenced session no longer exists on disk. */
  stale: boolean;
}

export interface PinListResponse {
  pins: PinListEntryResponse[];
}