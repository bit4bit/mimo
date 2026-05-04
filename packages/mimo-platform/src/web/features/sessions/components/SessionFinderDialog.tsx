import type { FC } from "hono/jsx";

export const SessionFinderDialog: FC = () => {
  return (
    <div
      id="session-finder-dialog"
      class="dialog-overlay hidden"
    >
      <div class="mimo-modal-content dialog-compact">
        <div class="dialog-header">
          Find Session{" "}
          <span class="dialog-help">Esc to close</span>
        </div>
        <input
          id="session-finder-input"
          type="text"
          placeholder="Search sessions..."
          autocomplete="off"
          class="code-input"
          data-help-id="session-finder-dialog-session-finder-input-input"
        />
        <div id="session-finder-results" class="finder-results">
          <div class="text-muted text-small finder-loading">
            Loading sessions...
          </div>
        </div>
      </div>
    </div>
  );
};
