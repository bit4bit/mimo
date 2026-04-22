// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

interface NotesBufferProps extends BufferProps {
  initialContent?: string;
  projectId?: string;
  projectNotesContent?: string;
}

export const NotesBuffer: FC<NotesBufferProps> = ({
  initialContent = "",
  sessionId,
  projectId = "",
  projectNotesContent = "",
}) => {
  return (
    <div
      class="notes-buffer"
      data-session-id={sessionId}
      data-project-id={projectId}
    >
      <div class="notes-section">
        <div class="notes-section-label">Project Notes</div>
        <textarea
          id="project-notes-input"
          class="notes-input"
          placeholder="Write notes shared across all sessions in this project..."
        >
          {projectNotesContent}
        </textarea>
        <div id="project-notes-save-status" class="notes-save-status">
          Saved
        </div>
      </div>

      <div class="notes-divider"></div>

      <div class="notes-section">
        <div class="notes-section-label">Session Notes</div>
        <textarea
          id="notes-input"
          class="notes-input"
          placeholder="Write notes for this session..."
        >
          {initialContent}
        </textarea>
        <div id="notes-save-status" class="notes-save-status">
          Saved
        </div>
      </div>

      <style>{`
        .notes-buffer {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          padding: 10px;
          gap: 8px;
        }
        .notes-section {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 80px;
          min-height: 0;
        }
        .notes-section-label {
          font-size: 11px;
          text-transform: uppercase;
          color: #888;
          letter-spacing: 0.05em;
          padding: 4px 0 2px;
        }
        .notes-input {
          flex: 1;
          min-height: 80px;
          resize: none;
          width: 100%;
          background: #1a1a1a;
          border: 1px solid #444;
          color: #d4d4d4;
          padding: 10px;
          font-family: monospace;
          font-size: 13px;
          line-height: 1.5;
        }
        .notes-input:focus {
          outline: none;
          border-color: #74c0fc;
        }
        .notes-divider {
          height: 1px;
          background: #444;
          margin: 6px 0;
        }
        .notes-save-status {
          align-self: flex-end;
          color: #888;
          font-size: 11px;
          text-transform: uppercase;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
};
