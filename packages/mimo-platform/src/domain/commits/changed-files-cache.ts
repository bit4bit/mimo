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
 * The commit preview, the commit/apply path, and the impact analysis all need
 * the same changed-file list. The list is derived from a stat-first two-tree
 * comparison, so caching it avoids running expensive directory scans when the
 * commit or impact buffer follows shortly after the preview was loaded.
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
    repoId?: string,
  ): ChangedFilesResult | undefined {
    const entry = this.entries.get(`${sessionId}:${repoId ?? ""}`);
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
      this.entries.delete(`${sessionId}:${repoId ?? ""}`);
      return undefined;
    }

    return entry.changedFiles;
  }

  set(
    sessionId: string,
    upstreamPath: string,
    workspacePath: string,
    changedFiles: ChangedFilesResult,
    repoId?: string,
  ): void {
    this.entries.set(`${sessionId}:${repoId ?? ""}`, {
      upstreamPath,
      workspacePath,
      changedFiles,
      cachedAt: Date.now(),
    });
  }

  invalidate(sessionId?: string): void {
    if (sessionId) {
      for (const key of this.entries.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
          this.entries.delete(key);
        }
      }
    } else {
      this.entries.clear();
    }
  }
}
