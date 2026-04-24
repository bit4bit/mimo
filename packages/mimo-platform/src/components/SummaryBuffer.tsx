import type { FC } from "hono/jsx";
import { useState } from "hono/jsx";

interface BufferProps {
  sessionId: string;
}

export interface ChatThread {
  id: string;
  name: string;
  model: string;
  mode: string;
  acpSessionId: string | null;
  state: "active" | "parked" | "waking" | "disconnected";
  createdAt: string;
  assignedAgentId?: string;
}

interface SummaryBufferProps extends BufferProps {
  threads?: ChatThread[];
}

const getThreadStateIcon = (state: string): string => {
  switch (state) {
    case "active":
      return "🟢";
    case "disconnected":
      return "🔴";
    case "waking":
      return "⏳";
    case "parked":
      return "🟡";
    default:
      return "⚪";
  }
};

export const SummaryBuffer: FC<SummaryBufferProps> = ({ sessionId, threads = [] }) => {
  const [analyzeThreadId, setAnalyzeThreadId] = useState(
    threads[0]?.id || "",
  );
  const [summarizeThreadId, setSummarizeThreadId] = useState(
    threads.find((t) => t.state === "active")?.id || "",
  );

  return (
    <div
      class="summary-buffer"
      style="display: flex; flex-direction: column; height: 100%; padding: 12px;"
    >
      <div
        class="summary-selectors"
        style="display: flex; gap: 8px; margin-bottom: 12px;"
      >
        <div style="flex: 1;">
          <label
            style="display: block; font-size: 10px; color: #888; margin-bottom: 4px;"
          >
            Analyze
          </label>
          <select
            class="summary-analyze-select"
            value={analyzeThreadId}
            onChange={(e) => setAnalyzeThreadId(e.target.value)}
            data-help-id="summary-buffer-summary-analyze-select"
            style="width: 100%; padding: 6px; background: #222; color: #ddd; border: 1px solid #444; border-radius: 4px;"
          >
            {threads.map((thread) => (
              <option value={thread.id}>
                {getThreadStateIcon(thread.state)} {thread.name}
              </option>
            ))}
          </select>
        </div>
        <div style="flex: 1;">
          <label
            data-help-id="summary-buffer-summarize-via-label"
            style="display: block; font-size: 10px; color: #888; margin-bottom: 4px;"
          >
            Summarize via
          </label>
          <select
            class="summary-summarize-select"
            value={summarizeThreadId}
            onChange={(e) => setSummarizeThreadId(e.target.value)}
            data-help-id="summary-buffer-summary-summarize-select"
            style="width: 100%; padding: 6px; background: #222; color: #ddd; border: 1px solid #444; border-radius: 4px;"
          >
            {threads.map((thread) => (
              <option value={thread.id}>
                {getThreadStateIcon(thread.state)} {thread.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        id="summary-refresh-btn"
        data-help-id="summary-buffer-summary-refresh-btn"
        style="padding: 8px 16px; background: #4a5568; color: white; border: none; border-radius: 4px; cursor: pointer; opacity: 0.9;"
      >
        Refresh
      </button>

      <div
        id="summary-error"
        style="margin-top: 12px; padding: 8px; background: #2c1a1a; color: #f88; border-radius: 4px; font-size: 13px; display: none;"
      ></div>

      <div
        id="summary-status"
        style="margin-top: 12px; padding: 8px; background: #1a2a1a; color: #8f8; border-radius: 4px; font-size: 13px; display: none;"
      ></div>

      <div
        id="summary-content"
        data-help-id="summary-buffer-summary-content"
        style="margin-top: 12px; padding: 12px; background: #1a1a2a; color: #ddd; border-radius: 4px; font-size: 13px; white-space: pre-wrap; overflow-y: auto; flex: 1; display: none;"
      ></div>
      <div
        id="summary-description"
        data-help-id="summary-buffer-description"
        style="margin-top: 8px; font-size: 11px; color: #666;"
      >
        The summary helps you remember what happened in the chat.
      </div>
    </div>
  );
};