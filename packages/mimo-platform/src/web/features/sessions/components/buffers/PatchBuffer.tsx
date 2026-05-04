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
      class="buffer-container"
    >
      {/* Patch Tabs Bar */}
      <div
        id="patch-buffer-tabs"
        class="tab-bar tab-bar-panel"
      >
        {/* Tabs rendered by JS */}
      </div>

      {/* Context Bar */}
      <div
        id="patch-context-bar"
        class="patch-context-bar hidden"
      >
        <span id="patch-file-path" class="text-primary"></span>
        <div class="flex-grow"></div>
        <button
          type="button"
          id="patch-close-btn"
          class="buffer-close-btn"
          title="Close patch"
        >
          ✕ Close
        </button>
      </div>

      {/* Split Diff View */}
      <div
        id="patch-diff-container"
        class="patch-diff-container flex flex-grow hidden"
      >
        {/* Original pane */}
        <div class="pane-column flex-grow flex flex-col">
          <div class="pane-header with-divider">
            ORIGINAL
          </div>
          <div id="patch-original-pane" class="mono-pane"></div>
        </div>

        {/* Divider */}
        <div class="panel-divider"></div>

        {/* Patched pane */}
        <div class="pane-column flex-grow flex flex-col">
          <div class="pane-header">
            PATCHED
          </div>
          <div id="patch-patched-pane" class="mono-pane"></div>
        </div>
      </div>

      {/* Empty State */}
      <div
        id="patch-empty-state"
        class="buffer-empty-state buffer-empty-centered flex flex-grow"
      >
        No pending patches.
      </div>
    </div>
  );
};
