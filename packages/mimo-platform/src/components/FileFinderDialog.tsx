import type { FC } from "hono/jsx";
import type { FileInfo } from "../files/types.js";

interface FileFinderDialogProps {
  sessionId: string;
}

export const FileFinderDialog: FC<FileFinderDialogProps> = ({ sessionId }) => {
  return (
    <div
      id="file-finder-dialog"
      data-session-id={sessionId}
      style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; align-items: flex-start; justify-content: center; padding-top: 80px;"
    >
      <div
        class="mimo-modal-content"
        style="width: 600px; max-width: 90%; background: #2d2d2d; border: 1px solid #444;"
      >
        <div style="font-size: 13px; color: #888; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #444;">
          Open File{" "}
          <span style="float: right; font-size: 11px;">Esc to close</span>
        </div>
        <input
          id="file-finder-input"
          type="text"
          placeholder="Type to filter files..."
          autocomplete="off"
          style="
            width: 100%;
            background: #1a1a1a;
            border: 1px solid #555;
            color: #d4d4d4;
            padding: 10px;
            font-family: monospace;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
          "
          data-help-id="file-finder-dialog-file-finder-input-input"
        />
        <div
          id="file-finder-results"
          style="margin-top: 8px; max-height: 320px; overflow-y: auto;"
        >
          <div style="color: #888; font-size: 12px; padding: 8px 0;">
            Loading files...
          </div>
        </div>
      </div>
    </div>
  );
};
