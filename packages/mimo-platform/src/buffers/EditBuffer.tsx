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
      style="display: flex; flex-direction: column; height: 100%;"
    >
      {/* File Tabs Bar */}
      <div
        id="edit-buffer-tabs"
        style="display: flex; background: #2d2d2d; border-bottom: 1px solid #444; overflow-x: auto; flex-shrink: 0;"
      >
        {/* Tabs rendered by JS */}
        <button
          type="button"
          id="open-file-finder-btn"
          style="
            padding: 8px 12px;
            border: none;
            border-right: 1px solid #444;
            background: transparent;
            color: #888;
            cursor: pointer;
            font-family: monospace;
            font-size: 12px;
            white-space: nowrap;
            flex-shrink: 0;
          "
          title="Open file (Mod+Shift+F)"
        >
          + Open File
        </button>
      </div>

      {/* File Context Bar */}
      <div
        id="edit-buffer-context"
        style="display: none; padding: 8px 12px; background: #252525; border-bottom: 1px solid #444; display: flex; gap: 12px; align-items: center; flex-shrink: 0; font-size: 12px; color: #888;"
      >
        <span id="edit-buffer-filepath" style="color: #d4d4d4;"></span>
        <span id="edit-buffer-linecount"></span>
        <span id="edit-buffer-language"></span>
        <div style="flex: 1;"></div>
        <button
          type="button"
          id="close-file-btn"
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
          title="Close file (Mod+W)"
        >
          ✕ Close
        </button>
      </div>

      {/* File Content View */}
      <div
        id="edit-buffer-content"
        style="flex: 1; overflow-y: auto; background: #1a1a1a; font-family: monospace; font-size: 13px; line-height: 1.5;"
      >
        <div
          id="edit-buffer-empty"
          style="padding: 40px; color: #555; text-align: center; font-size: 13px;"
        >
          No file open. Press Mod+Shift+F to open a file.
        </div>
        <table
          id="edit-buffer-lines"
          style="display: none; width: 100%; border-collapse: collapse;"
        >
          <tbody id="edit-buffer-lines-body"></tbody>
        </table>
      </div>
    </div>
  );
};
