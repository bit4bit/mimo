// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

// The plan is live, per-thread runtime state delivered over the websocket
// (see chat.js `handlePlan`). The server renders an empty shell; `#plan-content`
// is populated client-side and reset on thread switch.
export const PlanBuffer: FC<BufferProps> = () => {
  return (
    <div class="buffer" id="plan-buffer">
      <div class="buffer-header">
        <span>Plan</span>
      </div>
      <div class="buffer-content plan-content" id="plan-content">
        <p class="plan-empty">No plan for this thread yet.</p>
      </div>

      <style>{`
        .plan-content {
          padding: 12px;
        }
        .plan-empty {
          color: #888;
          font-size: 12px;
          font-style: italic;
          margin: 0;
        }
        .plan-entry {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 0;
          border-bottom: 1px solid #2a2a2a;
        }
        .plan-entry:last-child {
          border-bottom: none;
        }
        .plan-status {
          flex: 0 0 auto;
          font-family: monospace;
          font-size: 13px;
          line-height: 1.4;
          width: 14px;
          text-align: center;
        }
        .plan-status-completed {
          color: #51cf66;
        }
        .plan-status-in_progress {
          color: #74c0fc;
        }
        .plan-status-pending {
          color: #888;
        }
        .plan-entry-body {
          flex: 1 1 auto;
          min-width: 0;
        }
        .plan-entry-content {
          color: #d4d4d4;
          font-size: 13px;
          line-height: 1.4;
          word-break: break-word;
        }
        .plan-entry-content.is-completed {
          color: #8a8a8a;
          text-decoration: line-through;
        }
        .plan-priority {
          display: inline-block;
          margin-top: 2px;
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 3px;
          text-transform: uppercase;
          font-family: monospace;
        }
        .plan-priority-high {
          background: #3a1a1a;
          color: #ff8787;
          border: 1px solid #6a2d2d;
        }
        .plan-priority-medium {
          background: #3a2a1a;
          color: #ffd43b;
          border: 1px solid #6a4a2d;
        }
        .plan-priority-low {
          background: #1a2a3a;
          color: #74c0fc;
          border: 1px solid #2d4a6a;
        }
      `}</style>
    </div>
  );
};
