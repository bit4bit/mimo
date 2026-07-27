// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";

/**
 * Global pinned-sessions drawer.
 *
 * Renders the overlay + drawer shell; the contents are populated client-side
 * by `/public/js/pinned-sessions-drawer.js`, which fetches
 * `GET /api/internal/users/:userId/pinned-sessions` on open and re-renders
 * the list. The drawer is hidden by default and shown when the
 * `mimo:pinned-drawer-open` custom event is dispatched (wired to the
 * top-nav `[≡]` button in `Layout`).
 *
 * Server-rendered shell keeps the drawer accessible to no-JS clients and
 * lets tests assert the empty-state markup without driving JS.
 */
export const PinnedSessionsDrawer: FC = () => {
  return (
    <div
      id="pinned-drawer-root"
      hidden={true}
      aria-hidden="true"
    >
      <div
        id="pinned-drawer-overlay"
        class="pinned-drawer-overlay"
        onclick="document.dispatchEvent(new CustomEvent('mimo:pinned-drawer-close'))"
      />
      <aside
        id="pinned-drawer"
        class="pinned-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Pinned sessions"
      >
        <div class="pinned-drawer-header">
          <span>Pinned Sessions</span>
          <button
            type="button"
            class="pinned-drawer-close"
            aria-label="Close pinned sessions drawer"
            data-help-id="pinned-sessions-drawer-close"
            onclick="document.dispatchEvent(new CustomEvent('mimo:pinned-drawer-close'))"
          >
            &times;
          </button>
        </div>
        <div
          id="pinned-drawer-list"
          class="pinned-drawer-list"
        >
          <div class="pinned-drawer-empty" id="pinned-drawer-empty">
            No pinned sessions yet
          </div>
        </div>
        <div class="pinned-drawer-footer">
          <a
            id="pinned-drawer-parallel-link"
            href="/pinned"
            class="pinned-drawer-parallel-btn"
            data-help-id="pinned-sessions-drawer-parallel"
          >
            View selected in parallel
          </a>
        </div>
      </aside>
    </div>
  );
};