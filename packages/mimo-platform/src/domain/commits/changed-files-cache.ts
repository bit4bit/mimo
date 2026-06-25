// SPDX-License-Identifier: AGPL-3.0-only
import type { ChangedFilesResult } from "../files/changed-files.js";

interface CacheEntry {
  upstreamPath: string;
  workspacePath: string;
  changedFiles: ChangedFilesResult;
  cachedAt: number;
}

/**
 * In-memory cache for patch-derived changed-file lists.
 *
 * Both the commit preview and the impact analysis need the same changed-file
 * list. The list is derived from the git diff patch, so caching it avoids
 * running expensive directory scans (or even re-parsing the patch) when the
 * impact buffer refreshes shortly after the preview was loaded.
 */
export class ChangedFilesCache {
  private entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 30_000) {
    this.ttlMs = ttlMs;
  }

  get(
    sessionId: string,
    upstreamPath: string,
    workspacePath: string,
  ): ChangedFilesResult | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) {
      return undefined;
    }

    if (
      entry.upstreamPath !== upstreamPath ||
      entry.workspacePath !== workspacePath
    ) {
      return undefined;
    }

    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.entries.delete(sessionId);
      return undefined;
    }

    return entry.changedFiles;
  }

  set(
    sessionId: string,
    upstreamPath: string,
    workspacePath: string,
    changedFiles: ChangedFilesResult,
  ): void {
    this.entries.set(sessionId, {
      upstreamPath,
      workspacePath,
      changedFiles,
      cachedAt: Date.now(),
    });
  }

  invalidate(sessionId?: string): void {
    if (sessionId) {
      this.entries.delete(sessionId);
    } else {
      this.entries.clear();
    }
  }
}
