import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

interface PatchBufferProps extends BufferProps {
  sessionId: string;
}

export const PatchBuffer: FC<PatchBufferProps> = ({ sessionId }) => {
  return (
    <div
      id="patch-buffer-container"
      data-session-id={sessionId}
      style="display: flex; flex-direction: column; height: 100%;"
    >
      {/* Patch Tabs Bar */}
      <div
        id="patch-buffer-tabs"
        style="display: flex; background: #2d2d2d; border-bottom: 1px solid #444; overflow-x: auto; flex-shrink: 0;"
      >
        {/* Tabs rendered by JS */}
      </div>

      {/* Context Bar */}
      <div
        id="patch-context-bar"
        style="display: none; padding: 8px 12px; background: #252525; border-bottom: 1px solid #444; flex-direction: row; gap: 12px; align-items: center; flex-shrink: 0; font-size: 12px; color: #888;"
      >
        <span id="patch-file-path" style="color: #d4d4d4;"></span>
        <div style="flex: 1;"></div>
        <button
          type="button"
          id="patch-close-btn"
          style="
            padding: 4px 8px;
            background: transparent;
            border: 1px solid #555;
            color: #888;
            font-family: monospace;
            font-size: 10px;
            cursor: pointer;
            border-radius: 3px;
          "
          title="Close patch"
        >
          ✕ Close
        </button>
      </div>

      {/* Split Diff View */}
      <div
        id="patch-diff-container"
        style="flex: 1; overflow: hidden; display: none; flex-direction: row;"
      >
        {/* Original pane */}
        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <div style="padding: 6px 12px; background: #2a2a2a; border-bottom: 1px solid #444; border-right: 1px solid #444; font-size: 12px; color: #888; flex-shrink: 0;">
            ORIGINAL
          </div>
          <div
            id="patch-original-pane"
            style="flex: 1; overflow: auto; padding: 0; font-family: monospace; font-size: 12px; line-height: 20px;"
          ></div>
        </div>

        {/* Divider */}
        <div style="width: 1px; background: #444; flex-shrink: 0;"></div>

        {/* Patched pane */}
        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <div style="padding: 6px 12px; background: #2a2a2a; border-bottom: 1px solid #444; font-size: 12px; color: #888; flex-shrink: 0;">
            PATCHED
          </div>
          <div
            id="patch-patched-pane"
            style="flex: 1; overflow: auto; padding: 0; font-family: monospace; font-size: 12px; line-height: 20px;"
          ></div>
        </div>
      </div>

      {/* Empty State */}
      <div
        id="patch-empty-state"
        style="flex: 1; display: flex; align-items: center; justify-content: center; color: #555; font-size: 13px;"
      >
        No pending patches.
      </div>
    </div>
  );
};
