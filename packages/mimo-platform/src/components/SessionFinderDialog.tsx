import type { FC } from "hono/jsx";

export const SessionFinderDialog: FC = () => {
  return (
    <div
      id="session-finder-dialog"
      style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; align-items: flex-start; justify-content: center; padding-top: 80px;"
    >
      <div
        class="mimo-modal-content"
        style="width: 600px; max-width: 90%; background: #2d2d2d; border: 1px solid #444;"
      >
        <div style="font-size: 13px; color: #888; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #444;">
          Find Session{" "}
          <span style="float: right; font-size: 11px;">Esc to close</span>
        </div>
        <input
          id="session-finder-input"
          type="text"
          placeholder="Search sessions..."
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
          id="session-finder-results"
          style="margin-top: 8px; max-height: 320px; overflow-y: auto;"
        >
          <div style="color: #888; font-size: 12px; padding: 8px 0;">
            Loading sessions...
          </div>
        </div>
      </div>
    </div>
  );
};