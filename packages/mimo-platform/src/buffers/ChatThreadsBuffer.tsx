// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
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
    <div
      class="chat-threads-container"
      style="display: flex; flex-direction: column; height: 100%;"
    >
      {/* Thread Tabs */}
      <div
        class="chat-threads-tabs"
        style="display: flex; background: #2d2d2d; border-bottom: 1px solid #444; overflow-x: auto;"
      >
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
              style={`
                padding: 8px 16px;
                border: none;
                border-right: 1px solid #444;
                background: ${thread.id === activeThreadId ? "#1a1a1a" : "transparent"};
                color: ${thread.id === activeThreadId ? "#d4d4d4" : "#888"};
                cursor: pointer;
                font-family: monospace;
                font-size: 12px;
                white-space: nowrap;
                display: flex;
                align-items: center;
                gap: 6px;
              `}
            >
              <span
                class="thread-status-indicator"
                data-thread-state={thread.state}
                title={title}
                style="cursor: help;"
              >
                {icon}
              </span>
              {thread.name}
            </button>
          );
        })}

        {/* Create thread button */}
        <button
          type="button"
          id="create-thread-btn"
          style={`
            padding: 8px 12px;
            border: none;
            border-right: 1px solid #444;
            background: transparent;
            color: #888;
            cursor: pointer;
            font-family: monospace;
            font-size: 12px;
            white-space: nowrap;
          `}
          title="Create new chat thread"
        >
          + New Thread
        </button>
      </div>

      {/* Thread Context Bar with Model/Mode Selectors */}
      <div
        class="chat-thread-context"
        style="padding: 8px 12px; background: #252525; border-bottom: 1px solid #444; display: flex; gap: 15px; align-items: center;"
      >
        {activeThread && (
          <>
            <div style="font-size: 12px; color: #888; white-space: nowrap;">
              Thread: <span style="color: #d4d4d4;">{activeThread.name}</span>
            </div>

            {/* Model Selector for active thread - always show */}
            <div
              class="thread-model-selector"
              style="display: flex; align-items: center; gap: 6px; white-space: nowrap;"
            >
              <label style="font-size: 11px; color: #888; text-transform: uppercase;">
                Model:
              </label>
              <select
                id="thread-model-select"
                data-thread-id={activeThread.id}
                style="
                  background: #2d2d2d;
                  border: 1px solid #444;
                  color: #d4d4d4;
                  padding: 4px 8px;
                  font-family: monospace;
                  font-size: 11px;
                  border-radius: 3px;
                  cursor: pointer;
                  min-width: 120px;
                "
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
            <div
              class="thread-mode-selector"
              style="display: flex; align-items: center; gap: 6px; white-space: nowrap;"
            >
              <label style="font-size: 11px; color: #888; text-transform: uppercase;">
                Mode:
              </label>
              <select
                id="thread-mode-select"
                data-thread-id={activeThread.id}
                style="
                  background: #2d2d2d;
                  border: 1px solid #444;
                  color: #d4d4d4;
                  padding: 4px 8px;
                  font-family: monospace;
                  font-size: 11px;
                  border-radius: 3px;
                  cursor: pointer;
                  min-width: 100px;
                "
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

            {/* Spacer to push delete button to the right */}
            <div style="flex: 1;"></div>

            <button
              type="button"
              id="delete-thread-btn"
              data-thread-id={activeThread.id}
              style="
                padding: 4px 8px;
                background: transparent;
                border: 1px solid #555;
                color: #888;
                font-family: monospace;
                font-size: 10px;
                cursor: pointer;
                border-radius: 3px;
                white-space: nowrap;
              "
              title="Delete this thread"
            >
              Delete
            </button>
          </>
        )}
        {!activeThread && (
          <div style="font-size: 12px; color: #888;">
            No active thread. Use + New Thread to get started.
          </div>
        )}
      </div>

      {/* Chat Messages Area */}
      <div
        class="chat-messages-wrapper"
        style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;"
      >
        <div
          class="buffer-content"
          id="chat-messages"
          data-session-id={sessionId}
          data-active-thread-id={activeThread?.id}
        >
          <div
            class="no-messages"
            style="padding: 20px; color: #888; text-align: center;"
          >
            <p>No messages yet.</p>
            <p style="font-size: 12px; margin-top: 10px;">
              Start chatting with the agent in this thread
            </p>
          </div>
        </div>
        <div
          id="chat-usage"
          class="chat-usage"
          style="display: none; font-size: 0.75em; color: #666; padding: 4px 10px; text-align: right; border-top: 1px solid #333;"
        ></div>
      </div>
    </div>
  );
};
