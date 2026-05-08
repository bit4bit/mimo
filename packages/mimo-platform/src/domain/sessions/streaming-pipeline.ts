// SPDX-License-Identifier: AGPL-3.0-only
import type { ChatMessage } from "./chat.ts";

export interface StreamingSnapshot {
  thoughtContent: string;
  messageContent: string;
}

export interface ExpertPendingEntry {
  chatThreadId: string;
  originalPath: string;
}

export type CommandList = Array<{
  name: string;
  description?: string;
  template?: string;
}>;

type BroadcastFn = (
  sessionId: string,
  message: Record<string, unknown>,
) => void;

interface ChatServiceLike {
  saveMessage(
    sessionId: string,
    message: ChatMessage,
    chatThreadId?: string,
  ): Promise<void>;
}

function streamKey(sessionId: string, chatThreadId?: string): string {
  return `${sessionId}:${chatThreadId || "__no-thread__"}`;
}

function promptStreamKey(
  sessionId: string,
  chatThreadId: string,
  promptId: string,
): string {
  return `${sessionId}:${chatThreadId}:${promptId}`;
}

export class ChatStreamingPipeline {
  private static readonly PROMPT_COMPLETION_DRAIN_MS = 120;

  private streamingBuffers = new Map<string, string>();
  private thoughtBuffers = new Map<string, string>();
  private toolCallBuffers = new Map<string, Map<string, any>>();
  private messageStartTimes = new Map<string, number>();
  private currentPromptByThread = new Map<string, string>();
  private availableCommandsBuffers = new Map<string, CommandList>();
  private expertPending = new Map<string, ExpertPendingEntry>();
  private cancelledKeys = new Set<string>();
  private promptInFlight = new Set<string>();
  private pendingPromptCompletions = new Map<
    string,
    {
      sessionId: string;
      threadId: string;
      activeChatThreadId?: string;
      usage?: Record<string, unknown>;
      promptId?: string;
      duration?: string;
      durationMs?: number;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(
    private chat: ChatServiceLike,
    private broadcast: BroadcastFn,
  ) {}

  private buildAndClearAssistantContent(key: string): string | null {
    const messageContent = this.streamingBuffers.get(key);
    const thoughtContent = this.thoughtBuffers.get(key);

    if (!messageContent && !thoughtContent) {
      return null;
    }

    let fullContent = messageContent || "";

    if (thoughtContent) {
      const toolCallsMap = this.toolCallBuffers.get(key);
      let toolsData = "";
      if (toolCallsMap && toolCallsMap.size > 0) {
        const tools: any[] = [];
        for (const [, toolCall] of toolCallsMap) {
          tools.push({
            title: toolCall.toolTitle,
            kind: toolCall.toolKind,
            status: toolCall.toolStatus,
            input: toolCall.toolInput,
          });
        }
        toolsData = "\n<tools>" + JSON.stringify(tools) + "</tools>";
        this.toolCallBuffers.delete(key);
      }
      fullContent = `<details><summary>Thought Process</summary>${thoughtContent}${toolsData}</details>\n\n${fullContent}`;
      this.thoughtBuffers.delete(key);
    }

    this.streamingBuffers.delete(key);
    return fullContent;
  }

  handleThoughtStart(
    sessionId: string,
    threadId: string,
    promptId?: string,
  ): void {
    this.extendPendingPromptCompletion(sessionId, threadId, promptId);
    const threadKey = streamKey(sessionId, threadId);
    if (promptId) {
      this.currentPromptByThread.set(threadKey, promptId);
    }
    const key = promptId
      ? promptStreamKey(sessionId, threadId, promptId)
      : threadKey;
    this.messageStartTimes.set(key, Date.now());
    this.thoughtBuffers.set(key, "");
    this.broadcast(sessionId, {
      type: "thought_start",
      chatThreadId: threadId,
      ...(promptId ? { promptId } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  handleThoughtChunk(
    sessionId: string,
    threadId: string,
    content: string,
    promptId?: string,
  ): void {
    this.extendPendingPromptCompletion(sessionId, threadId, promptId);
    const key = promptId
      ? promptStreamKey(sessionId, threadId, promptId)
      : streamKey(sessionId, threadId);
    const current = this.thoughtBuffers.get(key) || "";
    this.thoughtBuffers.set(key, current + content);
    this.broadcast(sessionId, {
      type: "thought_chunk",
      chatThreadId: threadId,
      content,
      ...(promptId ? { promptId } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  handleThoughtEnd(
    sessionId: string,
    threadId: string,
    promptId?: string,
  ): void {
    this.extendPendingPromptCompletion(sessionId, threadId, promptId);
    this.broadcast(sessionId, {
      type: "thought_end",
      chatThreadId: threadId,
      ...(promptId ? { promptId } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  handleMessageChunk(
    sessionId: string,
    threadId: string,
    content: string,
    promptId?: string,
  ): void {
    this.extendPendingPromptCompletion(sessionId, threadId, promptId);
    const threadKey = streamKey(sessionId, threadId);
    if (promptId) {
      this.currentPromptByThread.set(threadKey, promptId);
    }
    const key = promptId
      ? promptStreamKey(sessionId, threadId, promptId)
      : threadKey;
    if (!this.messageStartTimes.has(key)) {
      this.messageStartTimes.set(key, Date.now());
    }
    const current = this.streamingBuffers.get(key) || "";
    this.streamingBuffers.set(key, current + content);
    this.broadcast(sessionId, {
      type: "message_chunk",
      chatThreadId: threadId,
      content,
      ...(promptId ? { promptId } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  handleToolCall(
    sessionId: string,
    threadId: string,
    tool: {
      toolCallId: string;
      toolTitle: string;
      toolKind: string;
      toolInput: unknown;
      toolStatus: string;
      timestamp: string;
      promptId?: string;
    },
  ): void {
    this.extendPendingPromptCompletion(sessionId, threadId, tool.promptId);
    const key = tool.promptId
      ? promptStreamKey(sessionId, threadId, tool.promptId)
      : streamKey(sessionId, threadId);
    if (!this.toolCallBuffers.has(key)) {
      this.toolCallBuffers.set(key, new Map());
    }
    this.toolCallBuffers.get(key)!.set(tool.toolCallId, { ...tool });
    this.broadcast(sessionId, {
      type: "tool_call",
      chatThreadId: threadId,
      toolCallId: tool.toolCallId,
      toolTitle: tool.toolTitle,
      toolKind: tool.toolKind,
      toolInput: tool.toolInput,
      toolStatus: tool.toolStatus,
      ...(tool.promptId ? { promptId: tool.promptId } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  handleToolCallUpdate(
    sessionId: string,
    threadId: string,
    update: {
      toolCallId: string;
      toolStatus: string;
      toolOutput?: unknown;
      timestamp: string;
      promptId?: string;
    },
  ): void {
    this.extendPendingPromptCompletion(sessionId, threadId, update.promptId);
    const key = update.promptId
      ? promptStreamKey(sessionId, threadId, update.promptId)
      : streamKey(sessionId, threadId);
    const toolCallsMap = this.toolCallBuffers.get(key);
    if (toolCallsMap && toolCallsMap.has(update.toolCallId)) {
      const toolCall = toolCallsMap.get(update.toolCallId)!;
      toolCall.toolStatus = update.toolStatus;
      if (update.toolOutput) {
        toolCall.toolOutput = update.toolOutput;
      }
      toolCall.timestamp = update.timestamp;
    }
    this.broadcast(sessionId, {
      type: "tool_call_update",
      chatThreadId: threadId,
      toolCallId: update.toolCallId,
      toolStatus: update.toolStatus,
      toolOutput: update.toolOutput,
      ...(update.promptId ? { promptId: update.promptId } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  async handleUsageUpdate(
    sessionId: string,
    threadId: string,
    usage: Record<string, unknown>,
    session: { activeChatThreadId?: string },
    promptId?: string,
  ): Promise<void> {
    this.extendPendingPromptCompletion(sessionId, threadId, promptId);
    const key = promptId
      ? promptStreamKey(sessionId, threadId, promptId)
      : streamKey(sessionId, threadId);

    // If this turn was already flushed as cancelled, drain any late-arrived
    // buffers so prompt_completed won't accidentally save them.
    if (this.cancelledKeys.has(key)) {
      this.cancelledKeys.delete(key);
      this.streamingBuffers.delete(key);
      this.thoughtBuffers.delete(key);
      this.toolCallBuffers.delete(key);
    }

    this.broadcast(sessionId, {
      type: "usage_update",
      chatThreadId: threadId,
      usage,
      ...(promptId ? { promptId } : {}),
      timestamp: new Date().toISOString(),
    });

    const pendingExpert = this.expertPending.get(key);
    if (pendingExpert) {
      this.broadcast(sessionId, {
        type: "expert_diff_ready",
        chatThreadId: threadId,
        originalPath: pendingExpert.originalPath,
      });
      this.expertPending.delete(key);
    }
  }

  async handlePromptCompleted(
    sessionId: string,
    threadId: string,
    session: { activeChatThreadId?: string },
    usage?: Record<string, unknown>,
    promptId?: string,
  ): Promise<void> {
    const key = promptId
      ? promptStreamKey(sessionId, threadId, promptId)
      : streamKey(sessionId, threadId);
    const threadKey = streamKey(sessionId, threadId);

    this.clearPendingPromptCompletion(key);

    // If cancelled, drain any late buffers and signal completion without saving.
    if (this.cancelledKeys.has(key)) {
      this.cancelledKeys.delete(key);
      this.streamingBuffers.delete(key);
      this.thoughtBuffers.delete(key);
      this.toolCallBuffers.delete(key);
      this.messageStartTimes.delete(key);
      this.broadcast(sessionId, {
        type: "prompt_completed",
        chatThreadId: threadId,
        ...(promptId ? { promptId } : {}),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const startMs = this.messageStartTimes.get(key);
    let duration: string | undefined;
    let durationMs: number | undefined;
    if (startMs !== undefined) {
      durationMs = Date.now() - startMs;
      const mins = Math.floor(durationMs / 60000);
      const secs = Math.floor((durationMs % 60000) / 1000);
      duration = `${mins}m${secs}s`;
      this.messageStartTimes.delete(key);
    }

    if (!promptId) {
      const fullContent = this.buildAndClearAssistantContent(key);
      if (fullContent !== null) {
        const historyThreadId = threadId || session.activeChatThreadId;
        if (historyThreadId) {
          await this.chat.saveMessage(
            sessionId,
            {
              role: "assistant",
              content: fullContent,
              timestamp: new Date().toISOString(),
              ...(duration !== undefined
                ? { metadata: { duration, durationMs } }
                : {}),
            },
            historyThreadId,
          );
        }
      }

      this.broadcast(sessionId, {
        type: "prompt_completed",
        chatThreadId: threadId,
        timestamp: new Date().toISOString(),
        ...(usage ? { usage } : {}),
        ...(duration !== undefined ? { duration, durationMs } : {}),
      });
      return;
    }

    const timeout = setTimeout(() => {
      void this.finalizePendingPromptCompletion(key);
    }, ChatStreamingPipeline.PROMPT_COMPLETION_DRAIN_MS);

    this.pendingPromptCompletions.set(key, {
      sessionId,
      threadId,
      activeChatThreadId: session.activeChatThreadId,
      usage,
      promptId,
      duration,
      durationMs,
      timeout,
    });
    this.currentPromptByThread.delete(threadKey);
  }

  private async finalizePendingPromptCompletion(key: string): Promise<void> {
    const pending = this.pendingPromptCompletions.get(key);
    if (!pending) return;
    this.pendingPromptCompletions.delete(key);

    const fullContent = this.buildAndClearAssistantContent(key);
    if (fullContent !== null) {
      const historyThreadId = pending.threadId || pending.activeChatThreadId;
      if (historyThreadId) {
        await this.chat.saveMessage(
          pending.sessionId,
          {
            role: "assistant",
            content: fullContent,
            timestamp: new Date().toISOString(),
            metadata: {
              ...(pending.promptId ? { promptId: pending.promptId } : {}),
              ...(pending.duration !== undefined
                ? {
                    duration: pending.duration,
                    durationMs: pending.durationMs,
                  }
                : {}),
            },
          },
          historyThreadId,
        );
      }
    }

    this.broadcast(pending.sessionId, {
      type: "prompt_completed",
      chatThreadId: pending.threadId,
      ...(pending.promptId ? { promptId: pending.promptId } : {}),
      timestamp: new Date().toISOString(),
      ...(pending.usage ? { usage: pending.usage } : {}),
      ...(pending.duration !== undefined
        ? { duration: pending.duration, durationMs: pending.durationMs }
        : {}),
    });
  }

  private clearPendingPromptCompletion(key: string): void {
    const pending = this.pendingPromptCompletions.get(key);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingPromptCompletions.delete(key);
  }

  private clearPendingPromptCompletionsForThread(threadKey: string): void {
    for (const [key, pending] of this.pendingPromptCompletions.entries()) {
      if (key.startsWith(`${threadKey}:`)) {
        clearTimeout(pending.timeout);
        this.pendingPromptCompletions.delete(key);
      }
    }
  }

  private extendPendingPromptCompletion(
    sessionId: string,
    threadId: string,
    promptId?: string,
  ): void {
    if (!promptId) return;
    const key = promptStreamKey(sessionId, threadId, promptId);
    const pending = this.pendingPromptCompletions.get(key);
    if (!pending) return;
    if (pending.promptId && promptId && pending.promptId !== promptId) {
      return;
    }
    clearTimeout(pending.timeout);
    pending.timeout = setTimeout(() => {
      void this.finalizePendingPromptCompletion(key);
    }, ChatStreamingPipeline.PROMPT_COMPLETION_DRAIN_MS);
  }

  async flushAsCancelled(
    sessionId: string,
    threadId: string,
    session: { activeChatThreadId?: string },
    promptId?: string,
  ): Promise<void> {
    const effectivePromptId =
      promptId ||
      this.currentPromptByThread.get(streamKey(sessionId, threadId));
    const key = effectivePromptId
      ? promptStreamKey(sessionId, threadId, effectivePromptId)
      : streamKey(sessionId, threadId);
    this.messageStartTimes.delete(key);

    const fullContent = this.buildAndClearAssistantContent(key);
    const historyThreadId = threadId || session.activeChatThreadId;
    if (historyThreadId) {
      await this.chat.saveMessage(
        sessionId,
        {
          role: "assistant",
          content: fullContent ?? "",
          timestamp: new Date().toISOString(),
          metadata: {
            cancelled: true,
            ...(effectivePromptId ? { promptId: effectivePromptId } : {}),
          },
        },
        historyThreadId,
      );
    }

    // Mark this key so a trailing usage_update from the agent doesn't
    // double-save the same (or partially-overlapping) content.
    this.cancelledKeys.add(key);
    this.currentPromptByThread.delete(streamKey(sessionId, threadId));
  }

  handleAvailableCommandsUpdate(
    sessionId: string,
    threadId: string,
    commands: CommandList,
  ): void {
    const key = streamKey(sessionId, threadId);
    const existing = this.availableCommandsBuffers.get(key);
    if (
      commands.length === 0 &&
      Array.isArray(existing) &&
      existing.length > 0
    ) {
      return;
    }
    this.availableCommandsBuffers.set(key, commands);
    if (commands.length > 0) {
      this.availableCommandsBuffers.set(streamKey(sessionId), commands);
    }
    this.broadcast(sessionId, {
      type: "available_commands_update",
      chatThreadId: threadId,
      commands,
      timestamp: new Date().toISOString(),
    });
  }

  getStreamingSnapshot(
    sessionId: string,
    threadId?: string,
  ): StreamingSnapshot {
    const promptId = threadId
      ? this.currentPromptByThread.get(streamKey(sessionId, threadId))
      : undefined;
    const key =
      threadId && promptId
        ? promptStreamKey(sessionId, threadId, promptId)
        : streamKey(sessionId, threadId);
    return {
      thoughtContent: this.thoughtBuffers.get(key) || "",
      messageContent: this.streamingBuffers.get(key) || "",
    };
  }

  getAvailableCommands(
    sessionId: string,
    threadId?: string,
  ): CommandList | undefined {
    const key = streamKey(sessionId, threadId);
    return (
      this.availableCommandsBuffers.get(key) ||
      this.availableCommandsBuffers.get(streamKey(sessionId))
    );
  }

  setPromptInFlight(sessionId: string, threadId?: string): void {
    this.promptInFlight.add(streamKey(sessionId, threadId));
  }

  clearPromptInFlight(sessionId: string, threadId?: string): void {
    this.promptInFlight.delete(streamKey(sessionId, threadId));
  }

  isPromptInFlight(sessionId: string, threadId?: string): boolean {
    return this.promptInFlight.has(streamKey(sessionId, threadId));
  }

  clearBuffers(sessionId: string, threadId?: string): void {
    const threadKey = streamKey(sessionId, threadId);
    this.clearPendingPromptCompletionsForThread(threadKey);
    const currentPromptId = this.currentPromptByThread.get(threadKey);
    const key = currentPromptId
      ? promptStreamKey(sessionId, threadId || "", currentPromptId)
      : threadKey;
    this.streamingBuffers.delete(key);
    this.thoughtBuffers.delete(key);
    this.toolCallBuffers.delete(key);
    this.messageStartTimes.delete(key);
    this.cancelledKeys.delete(key);
    this.promptInFlight.delete(threadKey);
    this.currentPromptByThread.delete(threadKey);
  }

  setExpertPending(
    sessionId: string,
    threadId: string,
    entry: ExpertPendingEntry,
  ): void {
    this.expertPending.set(streamKey(sessionId, threadId), entry);
  }

  getExpertPending(
    sessionId: string,
    threadId: string,
  ): ExpertPendingEntry | undefined {
    return this.expertPending.get(streamKey(sessionId, threadId));
  }

  deleteExpertPending(sessionId: string, threadId: string): void {
    this.expertPending.delete(streamKey(sessionId, threadId));
  }
}
