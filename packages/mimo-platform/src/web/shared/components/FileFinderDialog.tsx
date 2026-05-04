import type { FC } from "hono/jsx";
import type { FileInfo } from "../../../domain/files/types.js";

interface FileFinderDialogProps {
  sessionId: string;
}

export const FileFinderDialog: FC<FileFinderDialogProps> = ({ sessionId }) => {
  return (
    <div
      id="file-finder-dialog"
      data-session-id={sessionId}
      class="dialog-overlay hidden"
    >
      <div class="mimo-modal-content dialog-wide">
        <div class="dialog-header">
          Open File
        </div>
        <input
          id="file-finder-input"
          type="text"
          placeholder="Type to filter files..."
          autocomplete="off"
          class="code-input"
          data-help-id="file-finder-dialog-file-finder-input-input"
        />
        <div id="file-finder-results" class="finder-results x-scroll">
          <div class="text-muted text-small finder-loading">
            Loading files...
          </div>
        </div>
      </div>
    </div>
  );
};
