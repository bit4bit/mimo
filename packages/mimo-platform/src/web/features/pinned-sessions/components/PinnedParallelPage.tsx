// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";

/** A resolved pin entry as returned by the internal API. */
export interface PinnedParallelEntry {
  sessionId: string;
  projectId: string;
  sessionTitle: string | null;
  branch: string | null;
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

  return (
    <Layout title="Pinned Sessions">
      <div class="pinned-parallel-container">
        <div class="pinned-parallel-toolbar">
          <span class="pinned-parallel-title">Pinned Sessions</span>
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