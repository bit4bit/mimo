// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

interface EditBufferProps extends BufferProps {
  sessionId: string;
}

export const EditBuffer: FC<EditBufferProps> = ({ sessionId }) => {
  return (
    <div
      id="edit-buffer-container"
      data-session-id={sessionId}
      class="buffer-container"
    >
      {/* File Tabs Bar */}
      <div id="edit-buffer-tabs" class="tab-bar tab-bar-panel">
        {/* Tabs rendered by JS */}
        <button
          type="button"
          id="open-file-finder-btn"
          class="chat-thread-action-btn"
          title="Open file (Mod+Shift+F)"
          style="color: #4caf50;"
        >
          +
        </button>
      </div>

      {/* File Context Bar */}
      <div id="edit-buffer-context" class="edit-context-bar hidden">
        <span id="edit-buffer-filepath" class="text-primary"></span>
        <span id="edit-buffer-linecount"></span>
        <span id="edit-buffer-language"></span>
        {/* Expert mode toggle button */}
        <button
          type="button"
          id="expert-mode-toggle"
          class="expert-toggle-btn hidden"
          title="Toggle Expert Mode (Alt+Shift+E)"
        >
          Expert Mode
        </button>
        {/* Expert mode thread selector */}
        <select
          id="expert-thread-select"
          class="expert-select hidden"
          title="Select chat thread for expert mode"
        >
          <option value="">Select thread...</option>
        </select>
        {/* Expert mode thread name */}
        <span id="expert-thread-name" class="expert-pill hidden"></span>
        {/* Expert mode status badge - hidden by default */}
        <span id="expert-status-badge" class="expert-badge hidden"></span>
        {/* Outdated indicator - hidden by default */}
        <span
          id="edit-buffer-outdated-indicator"
          class="outdated-indicator hidden"
        >
          ● Outdated
        </span>
        {/* Reload button - hidden by default */}
        <button
          type="button"
          id="reload-file-btn"
          class="reload-file-btn hidden"
          title="Reload file (Alt+Shift+R)"
        >
          ↻ Reload
        </button>
        <div class="flex-grow"></div>
        <button
          type="button"
          id="close-file-btn"
          class="buffer-close-btn"
          title="Close file (Mod+W)"
        >
          ✕ Close
        </button>
      </div>

      {/* File Content View */}
      <div id="edit-buffer-content" tabindex="0" class="edit-buffer-content">
        <div id="expert-focus-guide" class="focus-guide-overlay hidden"></div>
        <div
          id="edit-buffer-empty"
          class="buffer-empty-state buffer-empty-padded"
        >
          No file open. Press Mod+Shift+F to open a file.
        </div>
        <table id="edit-buffer-lines" class="hidden edit-lines-table">
          <tbody id="edit-buffer-lines-body"></tbody>
        </table>
      </div>

      {/* Expert mode instruction input - pinned at bottom like chat */}
      <div
        id="expert-instruction-input"
        class="hidden expert-input-shell"
      ></div>

      {/* Expert mode actions bar — Cancel button only */}
      <div id="expert-actions" class="expert-actions-bar hidden">
        <button
          type="button"
          id="expert-cancel-btn"
          class="expert-cancel-btn hidden"
          title="Cancel processing"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
