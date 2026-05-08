// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { useState } from "hono/jsx";
import type { BufferProps } from "./buffers/types.js";

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

interface InternalBufferProps {
  sessionId: string;
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

export const SummaryBuffer: FC<SummaryBufferProps> = ({
  sessionId,
  threads = [],
}) => {
  const [analyzeThreadId, setAnalyzeThreadId] = useState(threads[0]?.id || "");
  const [summarizeThreadId, setSummarizeThreadId] = useState(
    threads.find((t) => t.state === "active")?.id || "",
  );

  return (
    <div class="summary-buffer">
      <div class="summary-selectors">
        <div class="summary-column">
          <label class="summary-label">Analyze</label>
          <select
            class="summary-analyze-select summary-select"
            value={analyzeThreadId}
            onChange={(e) => setAnalyzeThreadId(e.target.value)}
            data-help-id="summary-buffer-summary-analyze-select"
          >
            {threads.map((thread) => (
              <option value={thread.id}>
                {getThreadStateIcon(thread.state)} {thread.name}
              </option>
            ))}
          </select>
        </div>
        <div class="summary-column">
          <label
            data-help-id="summary-buffer-summarize-via-label"
            class="summary-label"
          >
            Summarize via
          </label>
          <select
            class="summary-summarize-select summary-select"
            value={summarizeThreadId}
            onChange={(e) => setSummarizeThreadId(e.target.value)}
            data-help-id="summary-buffer-summary-summarize-select"
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
        class="summary-refresh-btn"
      >
        Refresh
      </button>

      <div id="summary-error" class="summary-message error hidden"></div>

      <div id="summary-status" class="summary-message success hidden"></div>

      <div
        id="summary-content"
        data-help-id="summary-buffer-summary-content"
        class="summary-content hidden"
      ></div>
      <div
        id="summary-description"
        data-help-id="summary-buffer-description"
        class="summary-description"
      >
        The summary helps you remember what happened in the chat.
      </div>
    </div>
  );
};
