// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

interface CommitBufferProps extends BufferProps {}

export const CommitBuffer: FC<CommitBufferProps> = ({ sessionId }) => {
  return (
    <div
      id="commit-panel"
      data-session-id={sessionId}
      data-buffer-panel="commit"
      class="buffer-container commit-buffer"
    >
      <div class="commit-buffer-header">
        <span class="commit-buffer-title">Commit Changes</span>
        <div class="inline-flex-row commit-buffer-actions">
          <button
            type="button"
            id="commit-refresh-btn"
            class="btn-small"
            data-help-id="commit-buffer-refresh-btn-button"
          >
            Refresh
          </button>
        </div>
      </div>

      <div class="commit-preview-container">
        <div class="commit-status-filters">
          <label class="status-filter">
            <input
              type="checkbox"
              id="filter-added"
              checked
              data-help-id="commit-buffer-filter-added-input"
            />
            <span class="status-badge status-added">Added</span>
            <span class="status-count">
              (<span id="count-added">0</span>)
            </span>
          </label>
          <label class="status-filter">
            <input
              type="checkbox"
              id="filter-modified"
              checked
              data-help-id="commit-buffer-filter-modified-input"
            />
            <span class="status-badge status-modified">Modified</span>
            <span class="status-count">
              (<span id="count-modified">0</span>)
            </span>
          </label>
          <label class="status-filter">
            <input
              type="checkbox"
              id="filter-deleted"
              data-help-id="commit-buffer-filter-deleted-input"
            />
            <span class="status-badge status-deleted">Deleted</span>
            <span class="status-count">
              (<span id="count-deleted">0</span>)
            </span>
          </label>
          <span class="status-counter-pill">
            <span id="selected-count">0</span> /{" "}
            <span id="total-count">0</span> selected
          </span>
        </div>
        <div id="commit-tree" class="commit-tree" tabindex="-1">
          <div class="commit-empty-state">Click Refresh to load changes.</div>
        </div>
      </div>

      <div class="commit-message-section">
        <textarea
          id="commit-message"
          rows={3}
          placeholder="Enter commit message..."
          minlength="1"
          data-help-id="commit-buffer-message-textarea"
        ></textarea>
        <div id="commit-error" class="commit-error"></div>
      </div>

      <div class="commit-actions">
        <button
          type="button"
          id="sync-now-btn"
          class="btn-secondary"
          data-help-id="commit-buffer-sync-now-btn-button"
        >
          Sync Now
        </button>
        <button
          type="button"
          id="force-push-btn"
          class="btn-danger"
          title="Force push committed changes to upstream (overwrites remote history)"
          data-help-id="commit-buffer-force-push-btn-button"
        >
          Force Push
        </button>
        <button
          type="button"
          id="commit-confirm"
          class="btn-primary"
          disabled
          data-help-id="commit-buffer-confirm-button"
        >
          Commit &amp; Push
        </button>
      </div>

      <div class="commit-buffer-status-row">
        <span id="commit-status" class="text-small"></span>
        <span id="sync-status" class="text-muted text-small"></span>
      </div>
    </div>
  );
};