// SPDX-License-Identifier: AGPL-3.0-only
import type { ChatStreamingPipeline } from "../sessions/streaming-pipeline.js";
import { AgentRepository } from "./repository.js";
import { SessionRepository } from "../sessions/repository.js";
import { AgentService } from "./service.js";
import type { ChatService } from "../sessions/chat.js";
import type { SessionModelState, SessionModeState } from "../sessions/state.js";
import { GitHttpServer } from "../vcs/git-http-server.js";
import { buildPublicCloneUrl } from "../vcs/clone-url.js";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import { normalizeAvailableCommands } from "../sessions/available-commands.js";
import { createPlatformMcpServerConfig } from "../../mcp/platform-config.js";
import { logger } from "../../logger.js";
import { resolveAgentSyncNowResult } from "../../api/rest/auto-commit.js";
import type { AutoCommitService } from "../auto-commit/service.js";
import type { OS } from "../../infrastructure/os/types.js";

// Re-export types for interface
export type { ChatService };
export type { SessionRepository };
export type { AgentRepository };
export type { AgentService };
export type { GitHttpServer };
export type { AutoCommitService };

// Define minimal interfaces for service dependencies
export interface SCCServiceLike {
  isStale: (path: string) => boolean;
}

export interface VcsServiceLike {
  gitPull: (
    workspacePath: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

export type AutoSyncReason =
  | "thought_end"
  | "usage_update"
  | "expert_diff_ready";

export interface AgentMessageRouterDeps {
  pipeline: ChatStreamingPipeline;
  sessionRepository: InstanceType<typeof SessionRepository>;
  agentRepository: InstanceType<typeof AgentRepository>;
  agentService: InstanceType<typeof AgentService>;
  chatSessions: Map<string, Set<any>>;
  broadcast: (sessionId: string, message: Record<string, unknown>) => void;
  triggerAutoSync: (sessionId: string, reason: AutoSyncReason) => Promise<void>;
  sessionStateService: {
    setModelState(sessionId: string, state: SessionModelState): void;
    setModeState(sessionId: string, state: SessionModeState): void;
  };
  chat: ChatService;
  sharedVcsServer: InstanceType<typeof GitHttpServer>;
  mimoContext: MimoContext;
  platformUrl: string;
  autoCommitService: AutoCommitService;
  sccService: SCCServiceLike;
  vcs: VcsServiceLike;
  os: OS;
}

export class AgentMessageRouter {
  private pendingPermissions = new Map<
    string,
    { agentWs: any; sessionId: string; chatThreadId?: string }
  >();
  private autoSyncInFlight = new Set<string>();
  private pendingActivityTouches = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private calculatingSessions = new Set<string>();
  private readonly ACTIVITY_TOUCH_DEBOUNCE_MS = 30_000;
  private readonly SESSION_ACTIVITY_EVENT_TYPES = new Set([
    "thought_start",
    "thought_chunk",
    "thought_end",
    "message_chunk",
    "usage_update",
  ]);

  constructor(private deps: AgentMessageRouterDeps) {}

  private requirePromptId(data: any, eventType: string): string | null {
    const promptId =
      typeof data?.promptId === "string" && data.promptId.length > 0
        ? data.promptId
        : null;
    if (promptId) return promptId;
    logger.warn(
      `[stream-protocol] dropped ${eventType} missing promptId session=${data?.sessionId || "unknown"} thread=${data?.chatThreadId || "unknown"}`,
    );
    return null;
  }

  private async resolveEffectiveThreadId(
    sessionId: string,
    threadId?: string,
  ): Promise<string | undefined> {
    if (threadId) {
      return threadId;
    }
    const session = await this.deps.sessionRepository.findById(sessionId);
    return session?.activeChatThreadId;
  }

  async handle(agentId: string, ws: any, data: any): Promise<void> {
    logger.debug("[agent] Received message:", data.type, data);
    process.stdout?.write?.("");

    if (
      data.sessionId &&
      typeof data.sessionId === "string" &&
      this.SESSION_ACTIVITY_EVENT_TYPES.has(data.type)
    ) {
      this.touchSessionActivity(data.sessionId);
    }

    switch (data.type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      case "agent_capabilities":
        await this.handleAgentCapabilities(agentId, data);
        break;
      case "agent_ready":
        await this.handleAgentReady(agentId, ws, data);
        break;
      case "thought_start":
        await this.handleThoughtStart(data);
        break;
      case "thought_chunk":
        await this.handleThoughtChunk(data);
        break;
      case "thought_end":
        await this.handleThoughtEnd(data);
        break;
      case "message_chunk":
        await this.handleMessageChunk(data);
        break;
      case "usage_update":
        await this.handleUsageUpdate(data);
        break;
      case "tool_call":
        await this.handleToolCall(data);
        break;
      case "tool_call_update":
        await this.handleToolCallUpdate(data);
        break;
      case "acp_response":
        await this.handleAcpResponse(data);
        break;
      case "available_commands_update":
        await this.handleAvailableCommandsUpdate(data);
        break;
      case "plan":
        await this.handlePlan(data);
        break;
      case "file_changed":
        await this.handleFileChanged(data);
        break;
      case "session_error":
        this.handleSessionError(data);
        break;
      case "agent_sessions_ready":
        this.handleAgentSessionsReady(data);
        break;
      case "acp_thread_created":
        await this.handleAcpThreadCreated(data);
        break;
      case "acp_thread_cleared":
        await this.handleAcpThreadCleared(data);
        break;
      case "clear_session_error":
        await this.handleClearSessionError(data);
        break;
      case "session_initialized":
        await this.handleSessionInitialized(ws, data);
        break;
      case "model_state":
        await this.handleModelState(data);
        break;
      case "mode_state":
        await this.handleModeState(data);
        break;
      case "acp_status":
        await this.handleAcpStatus(data);
        break;
      case "prompt_received":
        await this.handlePromptReceived(data);
        break;
      case "prompt_completed":
        await this.handlePromptCompleted(data);
        break;
      case "sync_now_result":
        this.handleSyncNowResult(data);
        break;
      case "permission_request":
        this.handlePermissionRequest(ws, data);
        break;
      case "permission_response":
        await this.handlePermissionResponse(data);
        break;
      case "error_response":
        await this.handleErrorResponse(data);
        break;
      case "acp_cancelled":
        this.handleAcpCancelled(data);
        break;
      default:
        logger.debug("[agent] Unknown message type:", data.type);
    }
  }

  private handleAcpCancelled(data: any): void {
    const sessionId = data.sessionId;
    if (!sessionId) {
      logger.debug("No sessionId in acp_cancelled");
      return;
    }
    const subscribers = this.deps.chatSessions.get(sessionId);
    if (subscribers) {
      subscribers.forEach((client: any) => {
        if (client.readyState === 1) {
          client.send(
            JSON.stringify({
              type: "acp_cancelled",
              sessionId,
              chatThreadId: data.chatThreadId,
              timestamp: new Date().toISOString(),
            }),
          );
        }
      });
    }
  }

  private async handleAgentCapabilities(
    agentId: string,
    data: any,
  ): Promise<void> {
    if (
      agentId &&
      data.availableModels &&
      data.availableModes &&
      data.defaultModelId &&
      data.defaultModeId
    ) {
      await this.deps.agentRepository.updateCapabilities(agentId, {
        availableModels: data.availableModels,
        defaultModelId: data.defaultModelId,
        availableModes: data.availableModes,
        defaultModeId: data.defaultModeId,
      });
      logger.debug(
        `[agent] Stored capabilities for agent ${agentId}: ${data.defaultModelId} / ${data.defaultModeId}`,
      );
    }
  }

  private async handleAgentReady(
    agentId: string,
    ws: any,
    data: any,
  ): Promise<void> {
    logger.debug(
      "[agent] Agent ready:",
      data.agentId,
      "workdir:",
      data.workdir,
    );
    process.stdout?.write?.("");

    if (data.workdir) {
      this.deps.agentService.handleAgentConnect(agentId, ws, data.workdir);
    }

    const [sessionLevelSessions, threadLevelSessions] = await Promise.all([
      this.deps.sessionRepository.findByAssignedAgentId(agentId),
      this.deps.sessionRepository.findByThreadAgentId(agentId),
    ]);
    const seenIds = new Set<string>();
    const sessions = [...sessionLevelSessions, ...threadLevelSessions].filter(
      (s) => {
        if (seenIds.has(s.id)) return false;
        seenIds.add(s.id);
        return true;
      },
    );

    logger.debug(
      "[agent] Found",
      sessions.length,
      "sessions assigned to agent",
      agentId,
    );
    process.stdout?.write?.("");

    if (sessions.length > 0) {
      const sessionsReady = [];
      const workdir = this.deps.agentService.getAgentWorkdir(agentId);
      logger.debug("[agent] Workdir:", workdir);
      process.stdout?.write?.("");

      for (const session of sessions) {
        const sessionId = session.id;
        logger.debug("[agent] Session:", sessionId, "status:", session.status);
        process.stdout?.write?.("");

        if (session.status === "active") {
          const vcsPath =
            this.deps.sessionRepository.getSessionRepoPath(sessionId);
          const cloneUrl = this.deps.sharedVcsServer.getUrl(sessionId);
          // External clone URL for agents running outside the deployment (e.g.
          // outside the container). Built from MIMO_PUBLIC_VCS_URL, mirroring the
          // clone command shown to browser users. The agent picks this over the
          // internal cloneUrl when started with --external.
          const publicCloneUrl = buildPublicCloneUrl({
            internalUrl: cloneUrl,
            platformUrl: this.deps.platformUrl,
            publicVcsUrl: this.deps.mimoContext.env?.MIMO_PUBLIC_VCS_URL,
            sessionId,
          });

          if (!this.deps.os.fs.exists(vcsPath)) {
            logger.warn(
              "[agent] Skipping session_ready for missing repo:",
              sessionId,
              "path:",
              vcsPath,
              "url:",
              cloneUrl,
            );
            continue;
          }

          logger.debug(
            "[agent] Using shared VCS server for session:",
            sessionId,
            "repo:",
            vcsPath,
            "url:",
            cloneUrl,
          );
          process.stdout?.write?.("");

          const sessionWithCreds =
            await this.deps.sessionRepository.findById(sessionId);

          let mcpServers: any[] = [];
          if (
            sessionWithCreds?.mcpServerIds &&
            sessionWithCreds.mcpServerIds.length > 0
          ) {
            try {
              mcpServers =
                await this.deps.mimoContext.services.mcpServer.resolveMcpServers(
                  sessionWithCreds.mcpServerIds,
                );
            } catch (err) {
              logger.error(
                `[agent] Failed to resolve MCP servers for session ${sessionId}:`,
                err,
              );
            }
          }

          if (sessionWithCreds?.mcpToken) {
            mcpServers.push(
              createPlatformMcpServerConfig(
                this.deps.platformUrl,
                sessionWithCreds.mcpToken,
              ),
            );
          }

          const allThreads = sessionWithCreds?.chatThreads ?? [];
          const agentThreads = allThreads.filter(
            (t: any) => t.assignedAgentId === agentId || !t.assignedAgentId,
          );
          const threadBootstrap = agentThreads.map((thread: any) => ({
            chatThreadId: thread.id,
            name: thread.name,
            model: thread.model,
            mode: thread.mode,
            acpSessionId: thread.acpSessionId,
            state: thread.state,
            brainWash: thread.brainWash ?? false,
          }));

          sessionsReady.push({
            sessionId,
            name: session.name,
            upstreamPath: session.upstreamPath,
            agentWorkspacePath: session.agentWorkspacePath,
            cloneUrl,
            publicCloneUrl,
            agentWorkspaceUser: sessionWithCreds?.agentWorkspaceUser,
            agentWorkspacePassword: sessionWithCreds?.agentWorkspacePassword,
            modelState: sessionWithCreds?.modelState ?? null,
            modeState: sessionWithCreds?.modeState ?? null,
            agentSubpath: sessionWithCreds?.agentSubpath ?? null,
            branch: sessionWithCreds?.branch ?? null,
            idleTimeoutMs: sessionWithCreds?.idleTimeoutMs ?? 600000,
            mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
            chatThreads: threadBootstrap,
            activeChatThreadId: sessionWithCreds?.activeChatThreadId ?? null,
          });
        }
      }

      if (sessionsReady.length > 0) {
        const message = {
          type: "session_ready",
          platformUrl: this.deps.platformUrl,
          sessions: sessionsReady,
        };
        logger.debug("[agent] Sending session_ready:", JSON.stringify(message));
        process.stdout?.write?.("");
        ws.send(JSON.stringify(message));
      } else {
        logger.debug("[agent] No sessions ready to send");
      }
    } else {
      logger.debug("[agent] No sessions assigned to agent");
    }
  }

  private handleThoughtStart(data: any): void {
    const sessionId = data.sessionId;
    const threadId = data.chatThreadId;
    if (!sessionId) {
      logger.debug("No sessionId in thought_start");
      return;
    }
    const promptId = this.requirePromptId(data, "thought_start");
    if (!promptId) return;
    this.deps.chat.updateAgentActivity(sessionId);
    this.deps.pipeline.handleThoughtStart(sessionId, threadId, promptId);
  }

  private handleThoughtChunk(data: any): void {
    const sessionId = data.sessionId;
    const threadId = data.chatThreadId;
    if (!sessionId) {
      logger.debug("No sessionId in thought_chunk");
      return;
    }
    const promptId = this.requirePromptId(data, "thought_chunk");
    if (!promptId) return;
    this.deps.chat.updateAgentActivity(sessionId);
    this.deps.pipeline.handleThoughtChunk(
      sessionId,
      threadId,
      data.content || "",
      promptId,
    );
  }

  private handleThoughtEnd(data: any): void {
    const sessionId = data.sessionId;
    const threadId = data.chatThreadId;
    if (!sessionId) {
      logger.debug("No sessionId in thought_end");
      return;
    }
    const promptId = this.requirePromptId(data, "thought_end");
    if (!promptId) return;
    this.deps.pipeline.handleThoughtEnd(sessionId, threadId, promptId);
    void this.deps.triggerAutoSync(sessionId, "thought_end");
  }

  private handleMessageChunk(data: any): void {
    const sessionId = data.sessionId;
    const threadId = data.chatThreadId;
    if (!sessionId) {
      logger.debug("No sessionId in message_chunk");
      return;
    }
    const promptId = this.requirePromptId(data, "message_chunk");
    if (!promptId) return;
    this.deps.chat.updateAgentActivity(sessionId);
    this.deps.pipeline.handleMessageChunk(
      sessionId,
      threadId,
      data.content || "",
      promptId,
    );
  }

  private async handleUsageUpdate(data: any): Promise<void> {
    const sessionId = data.sessionId;
    const threadId = data.chatThreadId;
    if (!sessionId) {
      logger.debug("No sessionId in usage_update");
      return;
    }
    const promptId = this.requirePromptId(data, "usage_update");
    if (!promptId) return;
    const session = await this.deps.sessionRepository.findById(sessionId);
    const effectiveThreadId =
      threadId || session?.activeChatThreadId || undefined;
    this.deps.pipeline.clearPromptInFlight(sessionId, effectiveThreadId);
    const hadExpertPending = !!this.deps.pipeline.getExpertPending(
      sessionId,
      threadId,
    );
    const sessionObj = session ? session : { activeChatThreadId: undefined };
    await this.deps.pipeline.handleUsageUpdate(
      sessionId,
      threadId,
      data.usage ?? {},
      sessionObj,
      promptId,
    );
    if (!hadExpertPending) {
      void this.deps.triggerAutoSync(sessionId, "usage_update");
    }
  }

  private handleToolCall(data: any): void {
    const sessionId = data.sessionId;
    const threadId = data.chatThreadId;
    if (!sessionId) {
      logger.debug("No sessionId in tool_call");
      return;
    }
    const promptId = this.requirePromptId(data, "tool_call");
    if (!promptId) return;
    this.deps.chat.updateAgentActivity(sessionId);
    this.deps.pipeline.handleToolCall(sessionId, threadId, {
      toolCallId: data.toolCallId,
      toolTitle: data.toolTitle,
      toolKind: data.toolKind,
      toolInput: data.toolInput,
      toolStatus: data.toolStatus,
      promptId,
      timestamp: data.timestamp,
    });
  }

  private handleToolCallUpdate(data: any): void {
    const sessionId = data.sessionId;
    const threadId = data.chatThreadId;
    if (!sessionId) {
      logger.debug("No sessionId in tool_call_update");
      return;
    }
    const promptId = this.requirePromptId(data, "tool_call_update");
    if (!promptId) return;
    this.deps.chat.updateAgentActivity(sessionId);
    this.deps.pipeline.handleToolCallUpdate(sessionId, threadId, {
      toolCallId: data.toolCallId,
      toolStatus: data.toolStatus,
      toolOutput: data.toolOutput,
      promptId,
      timestamp: data.timestamp,
    });
  }

  private async handleAcpResponse(data: any): Promise<void> {
    const sessionId = data.sessionId;
    if (!sessionId) {
      logger.debug("No sessionId in acp_response");
      return;
    }

    const subscribers = this.deps.chatSessions.get(sessionId);
    if (subscribers) {
      subscribers.forEach((client) => {
        if (client.readyState === 1) {
          client.send(
            JSON.stringify({
              type: "message",
              role: "assistant",
              chatThreadId: data.chatThreadId,
              content: data.content,
              timestamp: new Date().toISOString(),
            }),
          );
        }
      });
    }

    const sessionRecord = await this.deps.sessionRepository.findById(sessionId);
    const threadId = data.chatThreadId || sessionRecord?.activeChatThreadId;

    if (threadId) {
      await this.deps.chat.saveMessage(
        sessionId,
        {
          role: "assistant",
          content: data.content,
          timestamp: new Date().toISOString(),
        },
        threadId,
      );
    }
  }

  private async handlePlan(data: any): Promise<void> {
    const sessionId = data.sessionId;
    if (!sessionId) {
      logger.debug("No sessionId in plan");
      return;
    }
    const threadId = await this.resolveEffectiveThreadId(
      sessionId,
      data.chatThreadId,
    );
    if (!threadId) {
      logger.warn(
        `[stream-protocol] dropped plan with no resolvable chat thread session=${sessionId}`,
      );
      return;
    }
    const entries = Array.isArray(data.entries) ? data.entries : [];
    this.deps.chat.updateAgentActivity(sessionId);
    this.deps.pipeline.handlePlan(sessionId, threadId, entries);
  }

  private handleAvailableCommandsUpdate(data: any): void {
    const sessionId = data.sessionId;
    const threadId = data.chatThreadId;
    if (!sessionId) {
      logger.debug("No sessionId in available_commands_update");
      return;
    }
    const commands = normalizeAvailableCommands(data.commands);
    this.deps.pipeline.handleAvailableCommandsUpdate(
      sessionId,
      threadId,
      commands,
    );
  }

  private async handleFileChanged(data: any): Promise<void> {
    logger.debug("File changed:", data.files);

    const sessionId = data.sessionId;
    if (!sessionId) {
      logger.debug("No sessionId in file_changed");
      return;
    }

    const session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      logger.debug(`[file_changed] Session not found: ${sessionId}`);
      return;
    }

    const pullResult = await this.deps.vcs.gitPull(session.agentWorkspacePath);
    if (!pullResult.success) {
      logger.error(
        `[file_changed] fossil up failed for session ${sessionId}: ${pullResult.error || "unknown error"}`,
      );
    }

    const changes = data.files.map((file: any) => ({
      path: file.path,
      isNew: file.isNew,
      deleted: file.deleted,
    }));

    await this.deps.mimoContext.services.fileSync.initializeSession(
      sessionId,
      "",
      "",
    );
    await this.deps.mimoContext.services.fileSync.handleFileChanges(
      sessionId,
      changes,
    );

    this.deps.broadcast(sessionId, {
      type: "file_list_invalidated",
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  private handleSessionError(data: any): void {
    logger.debug("[agent] Session error:", data.sessionId, data.error);
  }

  private handleAgentSessionsReady(data: any): void {
    logger.debug("[agent] Agent sessions ready:", data.sessionIds);
  }

  private async handleAcpThreadCreated(data: any): Promise<void> {
    const { sessionId, acpSessionId, wasReset, resetReason } = data;
    const threadId = data.chatThreadId;
    logger.debug("[agent] ACP session created:", {
      sessionId,
      chatThreadId: threadId,
      acpSessionId,
      wasReset,
      resetReason,
    });

    if (sessionId && acpSessionId && threadId) {
      await this.deps.sessionRepository.updateChatThread(sessionId, threadId, {
        acpSessionId,
      });
      logger.debug(
        `[agent] Updated thread ${threadId} acpSessionId to ${acpSessionId}`,
      );

      if (wasReset) {
        // A reset thread starts from fresh agent context, so any retained plan
        // snapshot is stale — wipe it (mirrors clear-session behavior).
        this.deps.pipeline.clearThreadPlan(sessionId, threadId);

        const timestamp = new Date().toISOString();
        const reasonText = resetReason ? ` (${resetReason})` : "";
        const systemMessage = `Session reset at ${timestamp}${reasonText}`;
        const session = await this.deps.sessionRepository.findById(sessionId);
        const historyThreadId = threadId || session?.activeChatThreadId;
        if (historyThreadId) {
          await this.deps.chat.saveMessage(
            sessionId,
            {
              role: "system",
              content: systemMessage,
              timestamp,
            },
            historyThreadId,
          );
        }
      }
    }
  }

  private async handleAcpThreadCleared(data: any): Promise<void> {
    const { sessionId, acpSessionId } = data;
    const threadId = data.chatThreadId;
    logger.debug("[agent] ACP session cleared:", {
      sessionId,
      chatThreadId: threadId,
      acpSessionId,
    });

    if (sessionId && acpSessionId && threadId) {
      await this.deps.sessionRepository.updateChatThread(sessionId, threadId, {
        acpSessionId,
      });
      logger.debug(
        `[agent] Updated thread ${threadId} acpSessionId to ${acpSessionId} after clear`,
      );

      // Clearing the thread context wipes its agent plan (keep-last-snapshot
      // otherwise persists it until the next plan update).
      this.deps.pipeline.clearThreadPlan(sessionId, threadId);

      const timestamp = new Date().toISOString();
      const session = await this.deps.sessionRepository.findById(sessionId);
      const historyThreadId = threadId || session?.activeChatThreadId;
      if (historyThreadId) {
        await this.deps.chat.saveMessage(
          sessionId,
          {
            role: "system",
            content: "Thread context cleared",
            timestamp,
          },
          historyThreadId,
        );
      }

      const subscribers = this.deps.chatSessions.get(sessionId);
      if (subscribers) {
        subscribers.forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "session_cleared",
                sessionId,
                chatThreadId: historyThreadId,
                timestamp,
              }),
            );
          }
        });
      }
    }
  }

  private async handleClearSessionError(data: any): Promise<void> {
    const { sessionId, error } = data;
    const threadId = data.chatThreadId;
    logger.debug("[agent] Clear session error:", {
      sessionId,
      chatThreadId: threadId,
      error,
    });

    if (sessionId) {
      const subscribers = this.deps.chatSessions.get(sessionId);
      if (subscribers) {
        subscribers.forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "clear_session_error",
                sessionId,
                chatThreadId: threadId,
                error,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        });
      }
    }
  }

  private async handleSessionInitialized(ws: any, data: any): Promise<void> {
    if (!data.sessionId) return;

    if (data.modelState) {
      this.deps.sessionStateService.setModelState(
        data.sessionId,
        data.modelState,
      );
      await this.deps.sessionRepository.update(data.sessionId, {
        modelState: data.modelState,
      });
      logger.debug(
        `[agent] Session ${data.sessionId} model state:`,
        data.modelState.currentModelId,
      );

      const session = await this.deps.sessionRepository.findById(
        data.sessionId,
      );
      if (session?.activeChatThreadId) {
        const thread = session.chatThreads.find(
          (t: any) => t.id === session.activeChatThreadId,
        );
        if (thread && (!thread.model || thread.model === "")) {
          await this.deps.sessionRepository.updateChatThread(
            data.sessionId,
            session.activeChatThreadId,
            { model: data.modelState.currentModelId },
          );
          logger.debug(
            `[agent] Updated thread ${session.activeChatThreadId} model to ${data.modelState.currentModelId}`,
          );
        }
      }
    }

    if (data.modeState) {
      this.deps.sessionStateService.setModeState(
        data.sessionId,
        data.modeState,
      );
      await this.deps.sessionRepository.update(data.sessionId, {
        modeState: data.modeState,
      });
      logger.debug(
        `[agent] Session ${data.sessionId} mode state:`,
        data.modeState.currentModeId,
      );

      const session = await this.deps.sessionRepository.findById(
        data.sessionId,
      );
      if (session?.activeChatThreadId) {
        const thread = session.chatThreads.find(
          (t: any) => t.id === session.activeChatThreadId,
        );
        if (thread && (!thread.mode || thread.mode === "")) {
          await this.deps.sessionRepository.updateChatThread(
            data.sessionId,
            session.activeChatThreadId,
            { mode: data.modeState.currentModeId },
          );
          logger.debug(
            `[agent] Updated thread ${session.activeChatThreadId} mode to ${data.modeState.currentModeId}`,
          );
        }
      }
    }

    // Re-cache capabilities from session_initialized payload
    const agentId = ws.data?.agentId;
    if (
      agentId &&
      data.modelState?.availableModels &&
      data.modeState?.availableModes
    ) {
      await this.deps.agentRepository.updateCapabilities(agentId, {
        availableModels: data.modelState.availableModels,
        defaultModelId: data.modelState.currentModelId,
        availableModes: data.modeState.availableModes,
        defaultModeId: data.modeState.currentModeId,
      });
    }

    // Broadcast to chat clients
    const message: any = {
      type: "session_initialized",
      sessionId: data.sessionId,
      chatThreadId: data.chatThreadId,
      timestamp: new Date().toISOString(),
    };
    if (data.modelState) {
      message.modelState = data.modelState;
    }
    if (data.modeState) {
      message.modeState = data.modeState;
    }
    this.deps.broadcast(data.sessionId, message);
  }

  private async handleModelState(data: any): Promise<void> {
    if (data.sessionId && data.modelState) {
      this.deps.sessionStateService.setModelState(
        data.sessionId,
        data.modelState,
      );
      await this.deps.sessionRepository.update(data.sessionId, {
        modelState: data.modelState,
      });

      const subscribers = this.deps.chatSessions.get(data.sessionId);
      if (subscribers) {
        subscribers.forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "model_state",
                sessionId: data.sessionId,
                chatThreadId: data.chatThreadId,
                modelState: data.modelState,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        });
      }
    }
  }

  private async handleModeState(data: any): Promise<void> {
    if (data.sessionId && data.modeState) {
      this.deps.sessionStateService.setModeState(
        data.sessionId,
        data.modeState,
      );
      await this.deps.sessionRepository.update(data.sessionId, {
        modeState: data.modeState,
      });

      const subscribers = this.deps.chatSessions.get(data.sessionId);
      if (subscribers) {
        subscribers.forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "mode_state",
                sessionId: data.sessionId,
                chatThreadId: data.chatThreadId,
                modeState: data.modeState,
                timestamp: new Date().toISOString(),
              }),
            );
          }
        });
      }
    }
  }

  private async handleAcpStatus(data: any): Promise<void> {
    const { sessionId, status } = data;
    logger.debug("[agent] ACP status update:", { sessionId, status });

    if (sessionId) {
      await this.deps.sessionRepository.update(sessionId, {
        acpStatus: status,
      });

      const subscribers = this.deps.chatSessions.get(sessionId);
      if (subscribers) {
        const message: any = {
          type: "acp_status",
          sessionId,
          status,
          timestamp: new Date().toISOString(),
        };

        if (data.wasReset) {
          message.wasReset = true;
          message.resetReason = data.resetReason;
          message.message = data.message || "Session reset";
        }

        subscribers.forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(message));
          }
        });
      }
    }
  }

  private async handlePromptReceived(data: any): Promise<void> {
    const promptId = this.requirePromptId(data, "prompt_received");
    if (!promptId) return;
    if (data.sessionId) {
      const effectiveThreadId = await this.resolveEffectiveThreadId(
        data.sessionId,
        data.chatThreadId,
      );
      this.deps.pipeline.setPromptInFlight(data.sessionId, effectiveThreadId);
    }
    const subscribers = this.deps.chatSessions.get(data.sessionId);
    if (subscribers) {
      subscribers.forEach((client: any) => {
        if (client.readyState === 1) {
          client.send(
            JSON.stringify({
              type: "prompt_received",
              sessionId: data.sessionId,
              chatThreadId: data.chatThreadId,
              promptId,
              timestamp: new Date().toISOString(),
            }),
          );
        }
      });
    }
  }

  private async handlePromptCompleted(data: any): Promise<void> {
    const sessionId = data.sessionId;
    const threadId = data.chatThreadId;
    const promptId = this.requirePromptId(data, "prompt_completed");
    if (!promptId) return;
    if (!sessionId) {
      return;
    }
    const session = await this.deps.sessionRepository.findById(sessionId);
    const sessionObj = session ? session : { activeChatThreadId: undefined };
    await this.deps.pipeline.handlePromptCompleted(
      sessionId,
      threadId,
      sessionObj,
      data.usage,
      promptId,
    );
  }

  private handleSyncNowResult(data: any): void {
    const resolved = resolveAgentSyncNowResult(data);
    if (!resolved) {
      logger.debug(
        "[agent] No pending sync request for result:",
        data.requestId,
      );
    }
  }

  private handlePermissionRequest(ws: any, data: any): void {
    const { sessionId, requestId, toolCall, options, chatThreadId } = data;
    if (!sessionId || !requestId) return;

    this.pendingPermissions.set(requestId, {
      agentWs: ws,
      sessionId,
      chatThreadId,
    });

    const subscribers = this.deps.chatSessions.get(sessionId);
    if (subscribers) {
      subscribers.forEach((client: any) => {
        if (client.readyState === 1) {
          client.send(
            JSON.stringify({
              type: "permission_request",
              requestId,
              toolCall,
              options,
              chatThreadId,
              timestamp: new Date().toISOString(),
            }),
          );
        }
      });
    }
  }

  private async handlePermissionResponse(data: any): Promise<void> {
    const { requestId, optionId } = data;
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return;

    this.pendingPermissions.delete(requestId);

    if (pending.agentWs.readyState === 1) {
      pending.agentWs.send(
        JSON.stringify({
          type: "permission_response",
          requestId,
          outcome: { outcome: "selected", optionId },
        }),
      );
    }

    const subscribers = this.deps.chatSessions.get(pending.sessionId);
    if (subscribers) {
      subscribers.forEach((client: any) => {
        if (client.readyState === 1) {
          client.send(
            JSON.stringify({
              type: "permission_resolved",
              requestId,
              chatThreadId: pending.chatThreadId,
            }),
          );
        }
      });
    }
  }

  private async handleErrorResponse(data: any): Promise<void> {
    const sessionId = data.sessionId;
    const threadId = data.chatThreadId;
    const rawError = data.error;

    const errorMessage =
      typeof rawError === "string"
        ? rawError
        : rawError?.message ||
          (rawError ? JSON.stringify(rawError) : "Unknown error");

    let session: any = null;
    if (sessionId) {
      session = await this.deps.sessionRepository.findById(sessionId);
    }

    if (sessionId) {
      const effectiveThreadId = threadId || session?.activeChatThreadId;
      this.deps.pipeline.clearPromptInFlight(sessionId, effectiveThreadId);
    }

    if (sessionId && errorMessage) {
      const timestamp = new Date().toISOString();
      const historyThreadId = threadId || session?.activeChatThreadId;
      if (historyThreadId) {
        await this.deps.chat.saveMessage(
          sessionId,
          {
            role: "system",
            content: errorMessage,
            timestamp,
          },
          historyThreadId,
        );
      }
      this.deps.broadcast(sessionId, {
        type: "error",
        chatThreadId: historyThreadId,
        message: errorMessage,
        timestamp,
      });
    }
  }

  private touchSessionActivity(sessionId: string): void {
    if (this.pendingActivityTouches.has(sessionId)) return;

    const timer = setTimeout(async () => {
      this.pendingActivityTouches.delete(sessionId);
      try {
        await this.deps.sessionRepository.touchSessionActivity(sessionId);
      } catch (error) {
        logger.error("[activity] failed to touch session activity", {
          sessionId,
          error,
        });
      }
    }, this.ACTIVITY_TOUCH_DEBOUNCE_MS);

    this.pendingActivityTouches.set(sessionId, timer);
  }

  // For use by index.tsx when a chat client sends a permission_response
  async routePermissionResponse(
    requestId: string,
    optionId: string,
  ): Promise<void> {
    await this.handlePermissionResponse({ requestId, optionId });
  }

  // For use by index.tsx to clean up when UI clients disconnect
  autoRejectPendingPermissionsForSession(
    sessionId: string,
    agentWs: any,
  ): void {
    for (const [requestId, pending] of this.pendingPermissions) {
      if (pending.sessionId === sessionId) {
        this.pendingPermissions.delete(requestId);
        if (pending.agentWs.readyState === 1) {
          pending.agentWs.send(
            JSON.stringify({
              type: "permission_response",
              requestId,
              outcome: { outcome: "cancelled" },
            }),
          );
        }
      }
    }
  }
}
