// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";

/** A resolved pin entry as returned by the internal API. */
export interface PinnedParallelEntry {
  sessionId: string;
  projectId: string;
  sessionTitle: string | null;
  branch: string | null;
  group: string;
  stale: boolean;
}

interface PinnedParallelPageProps {
  pins: PinnedParallelEntry[];
  /**
   * True when the user has at least one pinned session. Used to pick the
   * right empty-state copy: "Pin a session first" (no pins) vs. "Select at
   * least one session to view in parallel" (pins exist but none selected).
   */
  hasPins?: boolean;
  /**
   * True when the request carried an `?ids=` query param (i.e. the drawer
   * explicitly selected zero or more sessions). When false, the page was
   * opened directly without selection.
   */
  selectionProvided?: boolean;
  /**
   * The list of distinct group labels the user has across all pins. The
   * parallel page renders one chip per group, in addition to an `All` chip.
   * Deduplicated case-insensitively (first-seen casing preserved).
   */
  groups?: string[];
  /**
   * The current group filter (`?group=`) or null when no filter is active.
   * The chip matching this label is rendered with the active style; when
   * null, the `All` chip is active.
   */
  activeGroup?: string | null;
}

/**
 * Build the URL for a group chip. Group chips reset the drawer's `?ids=`
 * selection — clicking a chip means "show me all pins in this group", a
 * fresh view. Without this, a chip click from `/pinned?ids=foo,bar` lands
 * on `/pinned?ids=foo,bar&group=baz` and the empty-state fires when the
 * selected ids aren't in the group.
 */
function buildChipHref(group: string | null): string {
  if (group === null) return "/pinned";
  return `/pinned?group=${encodeURIComponent(group)}`;
}

/**
 * `/pinned` page — renders one column per pinned session, each embedding the
 * session page in `?embed=1` mode inside a same-origin iframe. Stale pins
 * render a placeholder column with an unpin action. An empty-state page is
 * shown when no pins exist or when no entries are selected.
 *
 * Active-column focus tracking is wired in `/public/js/pinned-parallel.js`.
 */
export const PinnedParallelPage: FC<PinnedParallelPageProps> = ({
  pins,
  hasPins = true,
  selectionProvided = false,
  groups = [],
  activeGroup = null,
}) => {
  if (pins.length === 0) {
    const message =
      !hasPins
        ? "Pin a session first"
        : selectionProvided
          ? "Select at least one session to view in parallel"
          : "Pin a session first";
    return (
      <Layout title="Pinned Sessions">
        <div class="pinned-parallel-empty">
          <div>{message}</div>
          <a href="/projects">Browse projects</a>
        </div>
      </Layout>
    );
  }

  const isActive = (g: string | null) =>
    g === null
      ? activeGroup === null
      : activeGroup !== null && activeGroup.toLowerCase() === g.toLowerCase();

  return (
    <Layout title="Pinned Sessions">
      <div class="pinned-parallel-container">
        <div class="pinned-parallel-toolbar">
          <span class="pinned-parallel-title">Pinned Sessions</span>
          <nav
            class="pinned-parallel-group-chips"
            data-help-id="pinned-parallel-group-chips"
            aria-label="Filter pinned sessions by group"
          >
            <a
              href={buildChipHref(null)}
              class={`pinned-parallel-group-chip${isActive(null) ? " active" : ""}`}
              data-group-chip="all"
            >
              All
            </a>
            {groups.map((g) => (
              <a
                href={buildChipHref(g)}
                class={`pinned-parallel-group-chip${isActive(g) ? " active" : ""}`}
                data-group-chip={g}
              >
                {g}
              </a>
            ))}
          </nav>
          <a href="/dashboard">Back to dashboard</a>
        </div>
        <div class="pinned-parallel-columns" id="pinned-parallel-columns">
          {pins.map((pin) => (
            <div
              class="pinned-parallel-column"
              data-session-id={pin.sessionId}
              data-project-id={pin.projectId}
            >
              <div class="pinned-parallel-column-header">
                <span
                  class="pinned-parallel-column-title"
                  title={pin.sessionTitle ?? "session no longer exists"}
                >
                  {pin.stale
                    ? "session no longer exists"
                    : (pin.sessionTitle ?? "Untitled")}
                  {!pin.stale && pin.branch ? ` | ⎇ ${pin.branch}` : ""}
                </span>
                <button
                  type="button"
                  class="pinned-drawer-entry-unpin"
                  data-help-id="pinned-parallel-column-unpin"
                  data-unpin-session-id={pin.sessionId}
                  onclick={
                    "document.dispatchEvent(new CustomEvent('mimo:pinned-parallel-unpin',{detail:{sessionId:this.dataset.unpinSessionId}}))"
                  }
                >
                  unpin
                </button>
              </div>
              {pin.stale ? (
                <div class="pinned-parallel-column-stale">
                  <div>session no longer exists</div>
                  <button
                    type="button"
                    class="pinned-drawer-entry-unpin"
                    data-unpin-session-id={pin.sessionId}
                    onclick={
                      "document.dispatchEvent(new CustomEvent('mimo:pinned-parallel-unpin',{detail:{sessionId:this.dataset.unpinSessionId}}))"
                    }
                  >
                    unpin
                  </button>
                </div>
              ) : (
                <iframe
                  class="pinned-parallel-column-iframe"
                  src={`/projects/${pin.projectId}/sessions/${pin.sessionId}?embed=1`}
                  title={pin.sessionTitle ?? "Session"}
                  data-help-id="pinned-parallel-column-iframe"
                />
              )}
            </div>
          ))}
        </div>
      </div>
      <script src="/js/pinned-parallel.js" defer></script>
    </Layout>
  );
};