import type { FC } from "hono/jsx";

interface ContentFinderDialogProps {
  sessionId: string;
}

export const ContentFinderDialog: FC<ContentFinderDialogProps> = ({
  sessionId,
}) => {
  return (
    <div
      id="content-finder-dialog"
      data-session-id={sessionId}
      style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; align-items: flex-start; justify-content: center; padding-top: 80px;"
    >
      <div
        class="mimo-modal-content"
        style="width: 700px; max-width: 90%; background: #2d2d2d; border: 1px solid #444;"
      >
        <div style="font-size: 13px; color: #888; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #444;">
          Search Content{" "}
          <span style="float: right; font-size: 11px;">Esc to close</span>
        </div>
        <input
          id="content-finder-input"
          type="text"
          placeholder="Type to search content (regex supported)..."
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
        />
        <div
          id="content-finder-results"
          style="margin-top: 8px; max-height: 400px; overflow-y: auto;"
        >
          <div style="color: #888; font-size: 12px; padding: 8px 0;">
            Press Enter to search...
          </div>
        </div>
        <div
          id="content-finder-status"
          style="font-size: 11px; color: #666; padding-top: 8px; border-top: 1px solid #444; margin-top: 8px;"
        ></div>
      </div>
    </div>
  );
};
