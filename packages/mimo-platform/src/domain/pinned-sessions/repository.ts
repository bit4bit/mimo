// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import { dump, load } from "js-yaml";

/** Maximum number of pinned sessions per user. */
export const PIN_LIMIT = 5;

/** Error code returned when the pin cap would be exceeded. */
export const PIN_LIMIT_ERROR = "pin_limit_reached";

/** A single ordered pin entry. Order reflects most-recently-pinned-first. */
export interface PinnedSessionEntry {
  sessionId: string;
  projectId: string;
}

/** On-disk shape of the pinned-sessions file. */
interface PinnedSessionsFile {
  entries: PinnedSessionEntry[];
}

/**
 * Error thrown when an `add` would exceed the configured pin cap.
 * Carries the configured limit so callers can surface it to clients.
 */
export class PinLimitReachedError extends Error {
  readonly limit: number;
  constructor(limit: number = PIN_LIMIT) {
    super(`Pin limit reached (${limit})`);
    this.name = "PinLimitReachedError";
    this.limit = limit;
  }
}

/**
 * Repository contract for the per-user pinned-sessions store.
 *
 * Implementations are expected to be ordered (most-recently-pinned-first)
 * and to enforce the configured pin cap on `add`.
 */
export interface PinnedSessionsRepository {
  /** Returns the ordered pin list for `username` (empty if none). */
  list(username: string): Promise<PinnedSessionEntry[]>;
  /**
   * Adds `{sessionId, projectId}` at the front of `username`'s list.
   * If the entry already exists, it is moved to the front (no duplicate).
   * Throws {@link PinLimitReachedError} when adding a new entry would
   * exceed the configured cap.
   */
  add(username: string, entry: PinnedSessionEntry): Promise<PinnedSessionEntry[]>;
  /** Removes the entry matching `sessionId` (no-op if absent). */
  remove(username: string, sessionId: string): Promise<PinnedSessionEntry[]>;
  /**
   * Rewrites the order to match `order`. The set of ids must match the
   * current entries exactly; otherwise the call is rejected.
   */
  reorder(username: string, order: string[]): Promise<PinnedSessionEntry[]>;
}

interface PinnedSessionsRepositoryDeps {
  os: OS;
  usersPath: string;
  /** Optional override for tests / smaller surfaces. */
  limit?: number;
}

/**
 * Filesystem-backed implementation of {@link PinnedSessionsRepository}.
 *
 * Persists the ordered list to
 * `<usersPath>/<username>/pinned-sessions.yaml`.
 */
export class FilePinnedSessionsRepository implements PinnedSessionsRepository {
  private os: OS;
  private readonly limit: number;

  constructor(private deps: PinnedSessionsRepositoryDeps) {
    this.os = deps.os;
    this.limit = deps.limit ?? PIN_LIMIT;
  }

  private getFilePath(username: string): string {
    return this.os.path.join(
      this.deps.usersPath,
      username,
      "pinned-sessions.yaml",
    );
  }

  private async read(username: string): Promise<PinnedSessionEntry[]> {
    const path = this.getFilePath(username);
    if (!(await this.os.fs.existsAsync(path))) {
      return [];
    }
    const content = await this.os.fs.readFileAsync(path, "utf-8");
    const data = (load(content) as PinnedSessionsFile | null) ?? {
      entries: [],
    };
    return Array.isArray(data.entries) ? data.entries : [];
  }

  private async write(
    username: string,
    entries: PinnedSessionEntry[],
  ): Promise<void> {
    const path = this.getFilePath(username);
    const dir = this.os.path.dirname(path);
    if (!(await this.os.fs.existsAsync(dir))) {
      await this.os.fs.mkdirAsync(dir, { recursive: true });
    }
    const file: PinnedSessionsFile = { entries };
    await this.os.fs.writeFileAsync(path, dump(file), {
      encoding: "utf-8",
    });
  }

  async list(username: string): Promise<PinnedSessionEntry[]> {
    return this.read(username);
  }

  async add(
    username: string,
    entry: PinnedSessionEntry,
  ): Promise<PinnedSessionEntry[]> {
    const current = await this.read(username);
    const filtered = current.filter(
      (e) => e.sessionId !== entry.sessionId,
    );
    if (filtered.length === current.length && current.length >= this.limit) {
      // Adding a brand-new entry would exceed the cap.
      throw new PinLimitReachedError(this.limit);
    }
    const next = [entry, ...filtered];
    await this.write(username, next);
    return next;
  }

  async remove(
    username: string,
    sessionId: string,
  ): Promise<PinnedSessionEntry[]> {
    const current = await this.read(username);
    const next = current.filter((e) => e.sessionId !== sessionId);
    if (next.length !== current.length) {
      await this.write(username, next);
    }
    return next;
  }

  async reorder(
    username: string,
    order: string[],
  ): Promise<PinnedSessionEntry[]> {
    const current = await this.read(username);
    const byId = new Map(current.map((e) => [e.sessionId, e] as const));
    // Reject if the supplied order doesn't match the current set exactly.
    if (
      order.length !== current.length ||
      order.some((id) => !byId.has(id))
    ) {
      throw new Error("reorder: supplied order does not match current pins");
    }
    const next = order.map((id) => byId.get(id)!);
    await this.write(username, next);
    return next;
  }
}