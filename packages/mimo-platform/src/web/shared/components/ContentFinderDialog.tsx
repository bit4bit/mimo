// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";

interface ContentFinderDialogProps {
  sessionId: string;
}

export const ContentFinderDialog: FC<ContentFinderDialogProps> = ({
  sessionId,
}) => {
  return (
    <div
      id="content-finder-dialog"
      data-session-id={sessionId}
      class="dialog-overlay hidden"
    >
      <div class="mimo-modal-content dialog-xwide">
        <div class="dialog-header">Search Content</div>
        <input
          id="content-finder-input"
          type="text"
          placeholder="Type to search content (regex supported)..."
          autocomplete="off"
          class="code-input"
        />
        <div id="content-finder-results" class="finder-results x-scroll tall">
          <div class="text-muted text-small finder-loading">
            Press Enter to search...
          </div>
        </div>
        <div
          id="content-finder-status"
          class="status-bar text-xs text-subtle"
        ></div>
      </div>
    </div>
  );
};
