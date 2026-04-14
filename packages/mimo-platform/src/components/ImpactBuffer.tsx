import type { FC } from "hono/jsx";
import type { BufferProps } from "../buffers/types.js";

interface ImpactBufferProps extends BufferProps {}

export const ImpactBuffer: FC<ImpactBufferProps> = ({ sessionId }) => {
  return (
    <div
      class="buffer buffer-right"
      id="impact-buffer"
      data-session-id={sessionId}
    >
      <div class="buffer-header">
        <span>Impact</span>
        <div style="display: inline-flex; align-items: center; gap: 8px; float: right;">
          <span
            id="impact-stale-badge"
            class="impact-stale-badge"
            style="display: none;"
          >
            ⚠ Outdated
          </span>
          <span
            id="impact-calculating-badge"
            class="impact-calculating-badge"
            style="display: none;"
          >
            ⏳ Analyzing...
          </span>
          <button id="impact-refresh-btn" type="button" class="btn-small">
            Refresh
          </button>
        </div>
      </div>
      <div class="buffer-content" id="impact-content">
        <div class="impact-loading">
          <p>Click Refresh to calculate impact metrics.</p>
        </div>
      </div>

      <style>{`
        .impact-stale-badge {
          color: #ffd43b;
          font-size: 11px;
        }

        .impact-calculating-badge {
          color: #74c0fc;
          font-size: 11px;
        }

        .impact-section {
          margin-bottom: 20px;
          padding: 12px;
          background: #2d2d2d;
          border: 1px solid #444;
          border-radius: 4px;
        }

        .impact-section-title {
          font-size: 11px;
          text-transform: uppercase;
          color: #888;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #444;
        }

        .btn-small {
          padding: 3px 8px;
          font-size: 11px;
        }

        .impact-metric {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          font-family: monospace;
          font-size: 13px;
        }

        .impact-metric-label {
          color: #888;
          min-width: 80px;
        }

        .impact-metric-value {
          color: #d4d4d4;
          font-weight: 500;
        }

        .impact-metric-value.positive {
          color: #51cf66;
        }

        .impact-metric-value.negative {
          color: #ff6b6b;
        }

        .impact-trend {
          font-size: 14px;
          margin-left: 4px;
        }

        .impact-trend-up {
          color: #51cf66;
        }

        .impact-trend-down {
          color: #ff6b6b;
        }

        .impact-trend-stable {
          color: #888;
        }

        .impact-language {
          padding: 8px 0;
          border-bottom: 1px solid #333;
        }

        .impact-language:last-child {
          border-bottom: none;
        }

        .impact-language-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .impact-language-name {
          font-weight: 500;
          color: #d4d4d4;
        }

        .impact-language-files {
          font-size: 11px;
          color: #888;
        }

        .impact-language-metrics {
          font-size: 12px;
          color: #888;
          font-family: monospace;
        }

        .impact-language-loc {
          color: #74c0fc;
        }

        .impact-language-complexity {
          color: #ffd43b;
        }

        .impact-no-data {
          color: #888;
          font-size: 12px;
          font-style: italic;
        }

        .impact-loading {
          text-align: center;
          padding: 40px 20px;
          color: #888;
        }

        .duplication-warning {
          border-color: #ff6b6b;
          background: #3d1f1f;
        }

        .impact-duplication-group {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid #333;
        }

        .impact-duplication-group-title {
          font-size: 10px;
          text-transform: uppercase;
          color: #666;
          margin-bottom: 4px;
        }

        .impact-clone {
          font-family: monospace;
          font-size: 11px;
          color: #aaa;
          padding: 2px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .impact-clone-file {
          color: #74c0fc;
        }

        .impact-clone-sep {
          color: #888;
        }

        .impact-clone-lines {
          color: #666;
        }
      `}</style>
    </div>
  );
};
