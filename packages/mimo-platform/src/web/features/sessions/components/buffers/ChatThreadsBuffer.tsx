// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

export interface ChatThread {
  id: string;
  name: string;
  model: string;
  mode: string;
  acpSessionId: string | null;
  state: "active" | "parked" | "waking" | "disconnected";
  createdAt: string;
}

export interface ModelOption {
  value: string;
  name: string;
  description?: string;
}

export interface ModeOption {
  value: string;
  name: string;
  description?: string;
}

interface ChatThreadsBufferProps extends BufferProps {
  threads?: ChatThread[];
  activeThreadId?: string | null;
  availableModels?: ModelOption[];
  availableModes?: ModeOption[];
}

export const ChatThreadsBuffer: FC<ChatThreadsBufferProps> = ({
  sessionId,
  threads = [],
  activeThreadId,
  availableModels = [],
  availableModes = [],
}) => {
  const activeThread =
    threads.find((t) => t.id === activeThreadId) ?? threads[0];

  return (
    <div class="chat-threads-container buffer-container">
      {/* Thread Tabs */}
      <div class="chat-threads-tabs">
        {/* Delete active thread button (sits left of '+' so the two
            +/- controls are colocated in the tab strip) */}
        <button
          type="button"
          id="delete-thread-btn"
          class="chat-thread-action-btn"
          title="Delete active chat thread"
          style="color: #ff6b6b;"
        >
          -
        </button>

        {/* Create thread button */}
        <button
          type="button"
          id="create-thread-btn"
          class="chat-thread-action-btn"
          title="Create new chat thread"
          style="color: #4caf50;"
        >
          +
        </button>

        {threads.map((thread) => {
          const icon =
            thread.state === "disconnected"
              ? "🔴"
              : thread.state === "active"
                ? "🟢"
                : thread.state === "waking"
                  ? "⏳"
                  : "💤";
          const title =
            thread.state === "disconnected"
              ? "Agent is disconnected"
              : thread.state === "active"
                ? "Agent is active and ready"
                : thread.state === "waking"
                  ? "ACP is starting up"
                  : "Agent sleeping. Will wake on next message.";

          return (
            <button
              type="button"
              class={`chat-thread-tab ${thread.id === activeThreadId ? "active" : ""}`}
              data-thread-id={thread.id}
            >
              <span
                class="thread-status-indicator"
                data-thread-state={thread.state}
                title={title}
              >
                {icon}
              </span>
              {thread.name}
            </button>
          );
        })}
      </div>

      {/* Thread Context Bar with Model/Mode Selectors */}
      <div class="chat-thread-context thread-context-bar">
        {activeThread && (
          <>
            <div class="thread-context-item text-muted">
              Thread: <span class="text-primary">{activeThread.name}</span>
            </div>

            {/* Model Selector for active thread - always show */}
            <div class="thread-model-selector thread-selector">
              <label class="thread-selector-label">Model:</label>
              <select
                id="thread-model-select"
                data-thread-id={activeThread.id}
                class="thread-selector-select thread-model-select"
              >
                {availableModels.length > 0 ? (
                  availableModels.map((model) => (
                    <option
                      value={model.value}
                      selected={model.value === activeThread.model}
                    >
                      {model.name}
                    </option>
                  ))
                ) : (
                  <option value="">Loading...</option>
                )}
              </select>
            </div>

            {/* Mode Selector for active thread - always show */}
            <div class="thread-mode-selector thread-selector">
              <label class="thread-selector-label">Mode:</label>
              <select
                id="thread-mode-select"
                data-thread-id={activeThread.id}
                class="thread-selector-select thread-mode-select"
              >
                {availableModes.length > 0 ? (
                  availableModes.map((mode) => (
                    <option
                      value={mode.value}
                      selected={mode.value === activeThread.mode}
                    >
                      {mode.name}
                    </option>
                  ))
                ) : (
                  <option value="">Loading...</option>
                )}
              </select>
            </div>

            {/* Spacer */}
            <div class="flex-grow"></div>
          </>
        )}
        {!activeThread && (
          <div class="text-small text-muted">
            No active thread. Use + to get started.
          </div>
        )}
      </div>

      {/* Chat Messages Area */}
      <div class="chat-messages-wrapper flex flex-col flex-grow messages-wrapper">
        <div
          class="buffer-content"
          id="chat-messages"
          data-session-id={sessionId}
          data-active-thread-id={activeThread?.id}
        >
          <div class="no-messages chat-empty-state text-muted">
            <p>No messages yet.</p>
            <p class="text-small chat-empty-hint">
              Start chatting with the agent in this thread
            </p>
          </div>
        </div>
        <div id="chat-usage" class="chat-usage hidden"></div>
      </div>
    </div>
  );
};
