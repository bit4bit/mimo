// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

interface FileTreeBufferProps extends BufferProps {}

export const FileTreeBuffer: FC<FileTreeBufferProps> = ({ sessionId }) => {
  return (
    <div
      class="file-tree-buffer"
      data-session-id={sessionId}
      data-buffer-id="file-tree"
    >
      <div class="buffer-header">
        <span>Files</span>
        <div class="inline-flex-row file-tree-header-actions">
          <select id="file-tree-repo-select" class="repo-select">
            <option value="">All repositories</option>
          </select>
          <button
            id="file-tree-refresh-btn"
            type="button"
            class="btn-small"
            data-help-id="file-tree-buffer-refresh-btn-button"
          >
            Refresh
          </button>
        </div>
      </div>
      <div class="buffer-content" id="file-tree-content">
        <div class="file-tree-loading">
          <p>Loading workspace...</p>
        </div>
      </div>

      <style>{`
        .file-tree-buffer {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }
        .file-tree-header-actions {
          float: right;
        }
        .file-tree-loading {
          text-align: center;
          padding: 40px 20px;
          color: #888;
        }

        .tree-root {
          font-family: monospace;
          font-size: 13px;
          color: #d4d4d4;
        }

        .tree-dir {
          display: block;
        }

        .tree-leaf {
          display: block;
        }

        /* Shared row layout for directory headers and file leaves so every
           row aligns on the same caret + label columns. */
        .tree-row {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 4px;
          border-radius: 3px;
          cursor: default;
          white-space: nowrap;
        }

        .tree-dir-header {
          cursor: pointer;
        }

        .tree-leaf-row {
          cursor: pointer;
        }

        .tree-dir-header:hover,
        .tree-leaf-row:hover {
          background: #3a3a3a;
        }

        .tree-children {
          padding-left: 14px;
        }

        .tree-caret,
        .tree-caret-spacer {
          display: inline-block;
          width: 12px;
          flex: 0 0 12px;
          color: #888;
          font-size: 10px;
        }

        .tree-caret-spacer {
          visibility: hidden;
        }

        .tree-label {
          flex: 1 1 auto;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tree-status {
          font-family: monospace;
          font-size: 12px;
          font-weight: bold;
          min-width: 12px;
          text-align: center;
          flex: 0 0 12px;
        }

        .tree-status.file-status-new {
          color: #51cf66;
        }

        .tree-status.file-status-changed {
          color: #74c0fc;
        }
      `}</style>
    </div>
  );
};
