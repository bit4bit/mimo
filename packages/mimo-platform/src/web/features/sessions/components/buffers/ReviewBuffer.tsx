// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

interface ReviewBufferProps extends BufferProps {
  baseBranch?: string;
  headBranch?: string;
}

export const ReviewBuffer: FC<ReviewBufferProps> = ({
  sessionId,
  baseBranch,
  headBranch,
}) => {
  return (
    <div
      id="review-panel"
      class="review-buffer"
      data-session-id={sessionId}
      data-buffer-id="review"
    >
      <div class="review-buffer-header">
        <span class="review-buffer-title">Review</span>
        <div class="inline-flex-row review-buffer-actions">
          <select id="review-repo-select" class="repo-select">
            <option value="">All repositories</option>
          </select>
          <button
            type="button"
            id="review-refresh-btn"
            class="btn-small review-refresh-btn"
            data-help-id="review-buffer-refresh-btn-button"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      <div class="review-summary">
        <span class="review-summary-item">
          <span class="file-status file-status--added">+</span>
          <span id="review-summary-added">0</span>
        </span>
        <span class="review-summary-item">
          <span class="file-status file-status--modified">~</span>
          <span id="review-summary-modified">0</span>
        </span>
        <span class="review-summary-item">
          <span class="file-status file-status--deleted">-</span>
          <span id="review-summary-deleted">0</span>
        </span>
      </div>

      <div class="review-compare" data-help-id="review-buffer-compare">
        <span class="review-compare-label">base</span>
        <span class="review-compare-ref">{baseBranch ?? "initial"}</span>
        <span class="review-compare-arrow">→</span>
        <span class="review-compare-label">current</span>
        <span class="review-compare-ref">{headBranch ?? "current"}</span>
      </div>

      <div class="review-split">
        <div
          id="review-tree"
          class="review-tree-pane"
          data-help-id="review-buffer-tree-pane"
        >
          <div class="review-empty-state">Click Refresh to load changes.</div>
        </div>
        <div
          id="review-diff"
          class="review-diff-pane"
          data-help-id="review-buffer-diff-pane"
        >
          <div class="review-diff-empty">Select a file to view its diff</div>
        </div>
      </div>
    </div>
  );
};
