import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

interface NotesBufferProps extends BufferProps {
  initialContent?: string;
}

export const NotesBuffer: FC<NotesBufferProps> = ({
  initialContent = "",
  sessionId,
}) => {
  return (
    <div class="notes-buffer" data-session-id={sessionId}>
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

      <style>{`
        .notes-buffer {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          padding: 10px;
          gap: 8px;
        }
        .notes-input {
          flex: 1;
          min-height: 140px;
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
        .notes-save-status {
          align-self: flex-end;
          color: #888;
          font-size: 11px;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
};
