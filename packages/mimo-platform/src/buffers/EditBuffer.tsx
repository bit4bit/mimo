// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
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
        style="display: none; padding: 8px 12px; background: #252525; border-bottom: 1px solid #444; flex-direction: row; gap: 12px; align-items: center; flex-shrink: 0; font-size: 12px; color: #888;"
      >
        <span id="edit-buffer-filepath" style="color: #d4d4d4;"></span>
        <span id="edit-buffer-linecount"></span>
        <span id="edit-buffer-language"></span>
        {/* Expert mode toggle button */}
        <button
          type="button"
          id="expert-mode-toggle"
          style="display: none; padding: 4px 10px; background: #4a90e2; border: none; color: #fff; font-family: monospace; font-size: 11px; cursor: pointer; border-radius: 3px;"
          title="Toggle Expert Mode (Alt+Shift+E)"
        >
          Expert Mode
        </button>
        {/* Expert mode thread selector */}
        <select
          id="expert-thread-select"
          style="display: none; padding: 4px 8px; background: #2a2a2a; border: 1px solid #444; color: #ddd; font-family: monospace; font-size: 11px; border-radius: 3px; max-width: 200px;"
          title="Select chat thread for expert mode"
        >
          <option value="">Select thread...</option>
        </select>
        {/* Expert mode thread name */}
        <span
          id="expert-thread-name"
          style="display: none; padding: 2px 8px; background: #2a2a2a; border: 1px solid #444; border-radius: 3px; color: #888; font-size: 11px;"
        ></span>
        {/* Expert mode status badge - hidden by default */}
        <span
          id="expert-status-badge"
          style="display: none; padding: 2px 8px; background: #4a90e2; color: #fff; font-size: 11px; border-radius: 3px; font-family: monospace;"
        ></span>
        {/* Outdated indicator - hidden by default */}
        <span
          id="edit-buffer-outdated-indicator"
          style="display: none; color: #ff9800; font-size: 11px; font-weight: 500;"
        >
          ● Outdated
        </span>
        {/* Reload button - hidden by default */}
        <button
          type="button"
          id="reload-file-btn"
          style="
            display: none;
            padding: 4px 10px;
            background: #3d3d3d;
            border: 1px solid #555;
            color: #ccc;
            font-family: monospace;
            font-size: 11px;
            cursor: pointer;
            border-radius: 3px;
            margin-left: 8px;
          "
          title="Reload file (Alt+Shift+R)"
        >
          ↻ Reload
        </button>
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
        tabindex="0"
        style="flex: 1; overflow-y: auto; background: #1a1a1a; font-family: monospace; font-size: 13px; line-height: 1.5; position: relative;"
      >
        <div
          id="expert-focus-guide"
          style="display: none; position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none; z-index: 10;"
        ></div>
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

      {/* Expert mode instruction input - pinned at bottom like chat */}
      <div
        id="expert-instruction-input"
        style="display: none; flex-shrink: 0; background: #1a1a1a; border-top: 1px solid #3b3b3b;"
      ></div>

      {/* Expert mode actions bar — Cancel button only */}
      <div
        id="expert-actions"
        style="display: none; padding: 8px 12px; background: #252525; border-top: 1px solid #444; flex-direction: row; gap: 12px; align-items: center; justify-content: center; flex-shrink: 0;"
      >
        <button
          type="button"
          id="expert-cancel-btn"
          style="display: none; padding: 6px 16px; background: #666; border: none; color: #fff; font-family: monospace; font-size: 12px; cursor: pointer; border-radius: 3px;"
          title="Cancel processing"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
