// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import { dump, load } from "js-yaml";

/** Maximum number of pinned sessions per user. */
export const PIN_LIMIT = 5;

/** Error code returned when the pin cap would be exceeded. */
export const PIN_LIMIT_ERROR = "pin_limit_reached";

/** Default group label applied when a pin request omits `group`. */
export const DEFAULT_GROUP = "Ungrouped";

/** A single ordered pin entry. Order reflects most-recently-pinned-first. */
export interface PinnedSessionEntry {
  sessionId: string;
  projectId: string;
  group: string;
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
   * Returns the subset of `username`'s pins whose `group` matches `group`
   * (case-insensitive). When `group` is `null` or empty, returns all pins.
   */
  listByGroup(
    username: string,
    group: string,
  ): Promise<PinnedSessionEntry[]>;
  /**
   * Adds `{sessionId, projectId, group}` at the front of `username`'s list.
   * The dedup key is `(sessionId, group)` (case-insensitive on group); if
   * a matching entry exists, it is moved to the front (no duplicate). A
   * new entry for the same `sessionId` under a different `group` is
   * allowed. Throws {@link PinLimitReachedError} when adding a brand-new
   * entry would exceed the configured cap.
   */
  add(
    username: string,
    entry: Omit<PinnedSessionEntry, "group"> & { group?: string },
  ): Promise<PinnedSessionEntry[]>;
  /** Removes every entry for `sessionId` (no-op if absent). */
  remove(username: string, sessionId: string): Promise<PinnedSessionEntry[]>;
  /**
   * Removes the entry matching `(sessionId, group)` (case-insensitive on
   * group) when `group` is supplied. When `group` is omitted, removes
   * every entry for `sessionId` (the same as `remove`).
   */
  removeByGroup(
    username: string,
    sessionId: string,
    group?: string,
  ): Promise<PinnedSessionEntry[]>;
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

function normalizeGroup(g: string | undefined | null): string {
  if (typeof g !== "string") return DEFAULT_GROUP;
  const trimmed = g.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_GROUP;
}

function sameGroup(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
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

  /**
   * Reads the user's pin file. Coerces any entry missing a `group` field
   * to {@link DEFAULT_GROUP} for backward compatibility with pre-group
   * pin files. The `dirty` flag in the result is true when at least one
   * entry had to be coerced; callers that want to persist the normalization
   * should call {@link write} afterwards.
   */
  private async read(username: string): Promise<{
    entries: PinnedSessionEntry[];
    dirty: boolean;
  }> {
    const path = this.getFilePath(username);
    if (!(await this.os.fs.existsAsync(path))) {
      return { entries: [], dirty: false };
    }
    const content = await this.os.fs.readFileAsync(path, "utf-8");
    const data = (load(content) as PinnedSessionsFile | null) ?? {
      entries: [],
    };
    const raw = Array.isArray(data.entries) ? data.entries : [];
    let dirty = false;
    const entries: PinnedSessionEntry[] = raw.map((e) => {
      if (
        e &&
        typeof e === "object" &&
        typeof (e as PinnedSessionEntry).sessionId === "string" &&
        typeof (e as PinnedSessionEntry).projectId === "string"
      ) {
        const entry = e as PinnedSessionEntry;
        if (typeof entry.group !== "string" || entry.group.length === 0) {
          dirty = true;
          return {
            sessionId: entry.sessionId,
            projectId: entry.projectId,
            group: DEFAULT_GROUP,
          };
        }
        return entry;
      }
      return { sessionId: "", projectId: "", group: DEFAULT_GROUP };
    });
    return { entries, dirty };
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
    const { entries, dirty } = await this.read(username);
    if (dirty) {
      await this.write(username, entries);
    }
    return entries;
  }

  async listByGroup(
    username: string,
    group: string,
  ): Promise<PinnedSessionEntry[]> {
    const all = await this.list(username);
    return all.filter((e) => sameGroup(e.group, group));
  }

  async add(
    username: string,
    entry: Omit<PinnedSessionEntry, "group"> & { group?: string },
  ): Promise<PinnedSessionEntry[]> {
    const normalized: PinnedSessionEntry = {
      sessionId: entry.sessionId,
      projectId: entry.projectId,
      group: normalizeGroup(entry.group),
    };
    const { entries: current, dirty } = await this.read(username);
    const filtered = current.filter(
      (e) =>
        !(
          e.sessionId === normalized.sessionId &&
          sameGroup(e.group, normalized.group)
        ),
    );
    const wouldExceedCap =
      filtered.length === current.length && current.length >= this.limit;
    if (wouldExceedCap) {
      throw new PinLimitReachedError(this.limit);
    }
    const next = [normalized, ...filtered];
    if (dirty) {
      // Persist the legacy-coercion alongside the new write.
      await this.write(username, next);
    } else {
      await this.write(username, next);
    }
    return next;
  }

  async remove(
    username: string,
    sessionId: string,
  ): Promise<PinnedSessionEntry[]> {
    return this.removeByGroup(username, sessionId);
  }

  async removeByGroup(
    username: string,
    sessionId: string,
    group?: string,
  ): Promise<PinnedSessionEntry[]> {
    const { entries: current, dirty } = await this.read(username);
    const normalizedGroup =
      group !== undefined ? normalizeGroup(group) : undefined;
    const next = current.filter((e) => {
      if (e.sessionId !== sessionId) return true;
      if (normalizedGroup === undefined) return false;
      return !sameGroup(e.group, normalizedGroup);
    });
    if (next.length !== current.length || dirty) {
      await this.write(username, next);
    }
    return next;
  }

  async reorder(
    username: string,
    order: string[],
  ): Promise<PinnedSessionEntry[]> {
    const { entries: current, dirty } = await this.read(username);
    const byId = new Map(current.map((e) => [e.sessionId, e] as const));
    // Reject if the supplied order doesn't match the current set exactly.
    if (
      order.length !== current.length ||
      order.some((id) => !byId.has(id))
    ) {
      throw new Error("reorder: supplied order does not match current pins");
    }
    const next = order.map((id) => byId.get(id)!);
    if (dirty) {
      await this.write(username, next);
    } else {
      await this.write(username, next);
    }
    return next;
  }
}