import type { ModelState, ModeState } from "./types";
import { logger } from "./logger.js";
import { decodeJwt } from "jose";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { Writable, Readable } from "node:stream";
import { SessionManager } from "./session.js";
import type { SessionCallbacks } from "./session.js";
import { SessionLifecycleManager } from "./lifecycle.js";
import type {
  CachedAcpState,
  QueuedPrompt,
  SessionLifecycleCallbacks,
  AcpSessionState,
} from "./lifecycle.js";
import {
  AcpClient,
  OpencodeProvider,
  ClaudeAgentProvider,
} from "./acp/index.js";
import type { IAcpProvider } from "./acp/index.js";
import WebSocket from "ws";
// Convert Node.js streams to Web Streams API
function toWebWritable(nodeWritable: Writable): WritableStream<Uint8Array> {
  return Writable.toWeb(nodeWritable) as WritableStream<Uint8Array>;
}

function toWebReadable(nodeReadable: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(nodeReadable) as ReadableStream<Uint8Array>;
}

class MimoAgent {
  private ws: WebSocket | null = null;
  private config: AgentConfig;
  private sessionManager: SessionManager;
  private acpClients: Map<string, AcpClient> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private provider: IAcpProvider;
  private pendingPermissions: Map<string, (r: any) => void> = new Map();
  private lifecycleManager: SessionLifecycleManager;
  private cachedAcpStates: Map<string, CachedAcpState> = new Map();

  constructor() {
    this.config = this.parseArgs();
    this.sessionManager = new SessionManager(this.config.workDir, {
      onFileChange: (sessionId, changes) => {
        this.send({
          type: "file_changed",
          sessionId,
          files: changes,
          timestamp: new Date().toISOString(),
        });
      },
      onSessionError: (sessionId, error) => {
        this.send({
          type: "session_error",
          sessionId,
          error,
          timestamp: new Date().toISOString(),
        });
      },
    });

    // Initialize lifecycle manager with callbacks
    this.lifecycleManager = new SessionLifecycleManager({
      onStatusChange: (sessionId, status) => {
        this.send({
          type: "acp_status",
          sessionId,
          status,
          timestamp: new Date().toISOString(),
        });
      },
      onCacheState: (sessionId, state) => {
        this.cachedAcpStates.set(sessionId, state);
      },
      onGetCachedState: (sessionId) => {
        return this.cachedAcpStates.get(sessionId);
      },
      onSpawnAcp: async (sessionId, cachedState) => {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session ${sessionId} not found`);
        }
        // Spawn ACP with cached state
        return this.respawnAcpProcess(sessionId, cachedState);
      },
      onTerminateSession: async (sessionId) => {
        // Cache the ACP state BEFORE closing
        const acpClient = this.acpClients.get(sessionId);
        if (acpClient) {
          this.cachedAcpStates.set(sessionId, {
            acpSessionId: acpClient.acpSessionId,
            modelState: acpClient.modelState,
            modeState: acpClient.modeState,
          });
        }

        // Close the ACP client gracefully (EOF → wait for process exit)
        await this.closeAcpClient(sessionId);

        // Stop the session: cleans up file watcher and force-kills the process
        // if it didn't exit within the close timeout above.
        this.sessionManager.stopSession(sessionId);
      },
    });

    switch (this.config.provider) {
      case "claude":
        this.provider = new ClaudeAgentProvider();
        break;
      case "opencode":
      default:
        this.provider = new OpencodeProvider();
        break;
    }
  }

  private parseArgs(): AgentConfig {
    const args = process.argv.slice(2);
    const config: Partial<AgentConfig> = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--token" && i + 1 < args.length) {
        config.token = args[++i];
      } else if (arg === "--platform" && i + 1 < args.length) {
        config.platform = args[++i];
      } else if (arg === "--workdir" && i + 1 < args.length) {
        config.workDir = args[++i];
      } else if (arg === "--provider" && i + 1 < args.length) {
        config.provider = args[++i] as AgentConfig["provider"];
      }
    }

    if (!config.token) {
      throw new Error("Missing required argument: --token");
    }
    if (!config.platform) {
      throw new Error("Missing required argument: --platform");
    }

    if (!config.workDir) {
      config.workDir = join(homedir(), ".mimo-agent");
    }

    // Ensure workDir exists
    if (!existsSync(config.workDir)) {
      mkdirSync(config.workDir, { recursive: true });
      logger.debug(`[mimo-agent] Created workDir: ${config.workDir}`);
    }

    const validProviders = new Set<AgentConfig["provider"]>([
      "opencode",
      "claude",
    ]);

    // Provider is now required
    if (!config.provider) {
      logger.error(
        `[mimo-agent] Missing required argument: --provider. Valid values: ${Array.from(validProviders).join(", ")}`,
      );
      process.exit(1);
    }

    if (!validProviders.has(config.provider as AgentConfig["provider"])) {
      logger.error(
        `[mimo-agent] Unknown provider: "${config.provider}". Valid values: ${Array.from(validProviders).join(", ")}`,
      );
      process.exit(1);
    }

    // Validate provider matches token
    this.validateProviderWithToken(config.token, config.provider);

    return config as AgentConfig;
  }

  private validateProviderWithToken(
    token: string,
    declaredProvider: string,
  ): void {
    try {
      // Decode JWT payload without verification to extract provider claim
      const payload = decodeJwt(token);
      const tokenProvider = payload.provider as string | undefined;

      if (!tokenProvider) {
        // Backward compatibility: legacy tokens don't have provider claim
        logger.warn(
          `[mimo-agent] Using legacy token, defaulting provider to 'opencode'. Consider recreating this agent.`,
        );
        // Treat missing provider as "opencode" for backward compatibility
        if (declaredProvider !== "opencode") {
          logger.error(
            `[mimo-agent] Provider mismatch: agent declares '${declaredProvider}' but legacy token requires 'opencode'. Recreate the agent or use --provider opencode`,
          );
          process.exit(1);
        }
        return;
      }

      if (tokenProvider !== declaredProvider) {
        logger.error(
          `[mimo-agent] Provider mismatch: agent declares '${declaredProvider}' but token requires '${tokenProvider}'. Use --provider ${tokenProvider}`,
        );
        process.exit(1);
      }

      // Provider matches - validation passed
    } catch (error) {
      logger.error(
        `[mimo-agent] Failed to decode token: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  }

  async start(): Promise<void> {
    logger.debug("[mimo-agent] Starting...");
    logger.debug(`[mimo-agent] Platform: ${this.config.platform}`);
    logger.debug(`[mimo-agent] WorkDir: ${this.config.workDir}`);

    await this.connect();
    this.setupShutdownHandlers();
  }

  private async connect(): Promise<void> {
    const wsUrl = `${this.config.platform}?token=${this.config.token}`;

    return new Promise((resolve, reject) => {
      logger.debug(`[mimo-agent] Connecting to ${this.config.platform}...`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on("open", () => {
        logger.debug("[mimo-agent] Connected to platform");
        this.reconnectAttempts = 0;

        this.send({
          type: "agent_ready",
          workdir: this.config.workDir,
          timestamp: new Date().toISOString(),
        });

        resolve();
      });

      this.ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.error("[mimo-agent] Failed to parse message:", error);
        }
      });

      this.ws.on("close", () => {
        logger.debug("[mimo-agent] Disconnected");
        this.handleDisconnect();
      });

      this.ws.on("error", (error: Error) => {
        logger.error("[mimo-agent] WebSocket error:", error.message);
        reject(error);
      });

      setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          reject(new Error("Connection timeout"));
        }
      }, 10000);
    });
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case "ping":
        this.send({ type: "pong" });
        break;

      case "session_ready":
        this.handleSessionReady(message);
        break;

      case "acp_request":
        this.handleAcpRequest(message);
        break;

      case "cancel_request":
        this.handleCancelRequest(message);
        break;

      case "file_sync_request":
        this.handleFileSyncRequest(message);
        break;

      case "user_message":
        this.handleUserMessage(message);
        break;

      case "set_model":
        this.handleSetModel(message);
        break;

      case "set_mode":
        this.handleSetMode(message);
        break;

      case "request_state":
        this.handleRequestState(message);
        break;

      case "permission_response":
        this.handlePermissionResponse(message);
        break;

      case "clear_session":
        this.handleClearSession(message);
        break;

      case "session_ended":
        this.handleSessionEnded(message);
        break;

      case "session_config_updated":
        this.handleSessionConfigUpdated(message);
        break;

      case "sync_now":
        this.handleSyncNow(message);
        break;

      default:
        logger.debug("[mimo-agent] Unknown message type:", message.type);
    }
  }

  private async handleSessionReady(message: any): Promise<void> {
    const { platformUrl, sessions } = message;

    if (!sessions || sessions.length === 0) {
      logger.debug("[mimo-agent] No sessions assigned");
      return;
    }

    logger.debug(`[mimo-agent] Received ${sessions.length} session(s)`);
    const sessionIds: string[] = [];

    for (const session of sessions) {
      const {
        sessionId,
        fossilUrl,
        agentWorkspaceUser,
        agentWorkspacePassword,
        acpSessionId,
        modelState,
        modeState,
        localDevMirrorPath,
        agentSubpath,
        mcpServers,
      } = session;

      try {
        const checkoutPath = join(this.config.workDir, sessionId);

        if (!fossilUrl) {
          throw new Error("No fossilUrl provided in session data");
        }

        logger.debug(`[mimo-agent] Using fossil URL: ${fossilUrl}`);

        // Setup checkout directory with credentials
        await this.setupCheckout(
          sessionId,
          checkoutPath,
          fossilUrl,
          agentWorkspaceUser,
          agentWorkspacePassword,
        );

        // Create session with credentials
        const sessionInfo = await this.sessionManager.createSession(
          sessionId,
          fossilUrl,
          agentWorkspaceUser,
          agentWorkspacePassword,
        );

        // Store acpSessionId for later use during ACP init
        if (acpSessionId) {
          this.sessionManager.setSessionAcpSessionId(sessionId, acpSessionId);
        }

        // Store cached model/mode so it can be restored after ACP initialization
        this.sessionManager.setSessionState(
          sessionId,
          modelState ?? undefined,
          modeState ?? undefined,
        );

        // Store localDevMirrorPath for file sync
        if (localDevMirrorPath) {
          this.sessionManager.setSessionLocalDevMirrorPath(
            sessionId,
            localDevMirrorPath,
          );
        }

        // Store MCP servers for ACP initialization
        if (mcpServers && Array.isArray(mcpServers) && mcpServers.length > 0) {
          this.sessionManager.setSessionMcpServers(sessionId, mcpServers);
          logger.debug(
            `[mimo-agent] Session ${sessionId} has ${mcpServers.length} MCP server(s)`,
          );
        }

        // Spawn ACP process
        await this.spawnAcpProcess({
          ...sessionInfo,
          agentSubpath: agentSubpath || undefined,
        });

        sessionIds.push(sessionId);
        logger.debug(`[mimo-agent] Session ${sessionId} ready`);
      } catch (error) {
        logger.error(
          `[mimo-agent] Failed to setup session ${sessionId}:`,
          error,
        );
        this.send({
          type: "session_error",
          sessionId,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
      }
    }

    this.send({
      type: "agent_sessions_ready",
      sessionIds,
      timestamp: new Date().toISOString(),
    });
  }

  private async setupCheckout(
    sessionId: string,
    checkoutPath: string,
    fossilUrl: string,
    agentWorkspaceUser?: string,
    agentWorkspacePassword?: string,
  ): Promise<void> {
    const repoPath = join(checkoutPath, "..", `${sessionId}.fossil`);

    if (existsSync(repoPath)) {
      logger.debug(`[mimo-agent]   Fossil repo exists, opening`);
      if (!existsSync(checkoutPath)) {
        mkdirSync(checkoutPath, { recursive: true });
      }
      try {
        execSync(`fossil open ${repoPath}`, {
          cwd: checkoutPath,
          stdio: "pipe",
        });
      } catch {
        // Already open or error, continue
      }
      // Update remote URL to new port/credentials
      if (agentWorkspaceUser && agentWorkspacePassword) {
        const url = new URL(fossilUrl);
        url.username = agentWorkspaceUser;
        url.password = agentWorkspacePassword;
        const remoteUrl = url.toString();
        logger.debug(
          `[mimo-agent]   Updating remote URL to: ${url.protocol}//${url.username}:****@${url.host}/`,
        );
        try {
          execSync(`fossil remote-url ${remoteUrl}`, {
            cwd: checkoutPath,
            stdio: "pipe",
          });
        } catch {
          // Ignore error, may already be correct
        }
        // Ensure local password matches server password
        try {
          execSync(
            `fossil user password ${agentWorkspaceUser} ${agentWorkspacePassword}`,
            { cwd: checkoutPath, stdio: "pipe" },
          );
          logger.debug(`[mimo-agent]   Updated local user password`);
        } catch {
          // Ignore error
        }
        // Update/add named remote "server" with credentials
        try {
          // Remove existing remote if exists, then add new one
          try {
            execSync(`fossil remote rm server`, {
              cwd: checkoutPath,
              stdio: "pipe",
            });
          } catch {
            // Remote may not exist, ignore
          }
          execSync(`fossil remote add server ${remoteUrl}`, {
            cwd: checkoutPath,
            stdio: "pipe",
          });
          logger.debug(`[mimo-agent]   Updated remote 'server'`);
          // Do a sync using the named remote to verify credentials work
          execSync(`fossil sync server`, { cwd: checkoutPath, stdio: "pipe" });
          logger.debug(`[mimo-agent]   Verified sync with remote 'server'`);
        } catch {
          // Ignore error
        }
      }
    } else if (existsSync(join(checkoutPath, ".fossil"))) {
      logger.debug(`[mimo-agent]   Checkout exists, ensuring open`);
      try {
        execSync(`fossil open`, { cwd: checkoutPath, stdio: "pipe" });
      } catch {
        // Already open or error, continue
      }
      // Update remote URL to new port/credentials
      if (agentWorkspaceUser && agentWorkspacePassword) {
        const url = new URL(fossilUrl);
        url.username = agentWorkspaceUser;
        url.password = agentWorkspacePassword;
        const remoteUrl = url.toString();
        logger.debug(
          `[mimo-agent]   Updating remote URL to: ${url.protocol}//${url.username}:****@${url.host}/`,
        );
        try {
          execSync(`fossil remote-url ${remoteUrl}`, {
            cwd: checkoutPath,
            stdio: "pipe",
          });
        } catch {
          // Ignore error, may already be correct
        }
        // Ensure local password matches server password
        try {
          execSync(
            `fossil user password ${agentWorkspaceUser} ${agentWorkspacePassword}`,
            { cwd: checkoutPath, stdio: "pipe" },
          );
          logger.debug(`[mimo-agent]   Updated local user password`);
        } catch {
          // Ignore error
        }
        // Update/add named remote "server" with credentials
        try {
          // Remove existing remote if exists, then add new one
          try {
            execSync(`fossil remote rm server`, {
              cwd: checkoutPath,
              stdio: "pipe",
            });
          } catch {
            // Remote may not exist, ignore
          }
          execSync(`fossil remote add server ${remoteUrl}`, {
            cwd: checkoutPath,
            stdio: "pipe",
          });
          logger.debug(`[mimo-agent]   Updated remote 'server'`);
          // Do a sync using the named remote to verify credentials work
          execSync(`fossil sync server`, { cwd: checkoutPath, stdio: "pipe" });
          logger.debug(`[mimo-agent]   Verified sync with remote 'server'`);
        } catch {
          // Ignore error
        }
      }
    } else {
      logger.debug(`[mimo-agent]   Cloning from fossil`);
      // Use credentials in URL if available
      let cloneUrl = fossilUrl;
      if (agentWorkspaceUser && agentWorkspacePassword) {
        const url = new URL(fossilUrl);
        url.username = agentWorkspaceUser;
        url.password = agentWorkspacePassword;
        cloneUrl = url.toString();
        logger.debug(
          `[mimo-agent]   Using authenticated URL: ${url.protocol}//${url.username}:****@${url.host}/`,
        );
      }
      execSync(`fossil clone ${cloneUrl} ${repoPath}`, { stdio: "pipe" });
      if (!existsSync(checkoutPath)) {
        mkdirSync(checkoutPath, { recursive: true });
      }
      // Open without sync first, then set remote with credentials
      execSync(`fossil open --nosync ${repoPath}`, {
        cwd: checkoutPath,
        stdio: "pipe",
      });
      // Set remote URL with credentials for future syncs
      execSync(`fossil remote-url ${cloneUrl}`, {
        cwd: checkoutPath,
        stdio: "pipe",
      });
      // Set local password to match server password (fossil creates local admin with random password)
      if (agentWorkspaceUser && agentWorkspacePassword) {
        execSync(
          `fossil user password ${agentWorkspaceUser} ${agentWorkspacePassword}`,
          { cwd: checkoutPath, stdio: "pipe" },
        );
        // Add a named remote "server" with credentials embedded
        execSync(`fossil remote add server ${cloneUrl}`, {
          cwd: checkoutPath,
          stdio: "pipe",
        });
        // Do an initial sync using the named remote with credentials
        execSync(`fossil sync server`, { cwd: checkoutPath, stdio: "pipe" });
      }
    }
  }

  /**
   * Gracefully close an existing ACP client for a session.
   *
   * Sends EOF to the agent's stdin and waits for it to exit (via connection.closed).
   * After this returns, the session's acpProcess will either have exited cleanly or
   * will be killed by the subsequent sessionManager.stopSession() safety-net call.
   */
  private async closeAcpClient(sessionId: string): Promise<void> {
    const acpClient = this.acpClients.get(sessionId);
    if (!acpClient) return;

    // Remove from map before closing so no new operations can be dispatched to it.
    this.acpClients.delete(sessionId);

    try {
      await acpClient.close(5000);
    } catch (err) {
      logger.warn(
        `[mimo-agent] Error during ACP client close for ${sessionId}:`,
        err,
      );
    }
  }

  private async spawnAcpProcess(session: any): Promise<void> {
    const sessionInfo = this.sessionManager.getSession(session.sessionId);
    if (!sessionInfo) return;

    // Close the existing ACP client gracefully before spawning a new one.
    // This sends EOF to the old process's stdin and waits for it to exit cleanly.
    await this.closeAcpClient(session.sessionId);

    // Safety-net: if the process still hasn't exited after the close timeout, kill it.
    if (sessionInfo.acpProcess && !sessionInfo.acpProcess.killed) {
      logger.debug(
        `[mimo-agent] Force-killing old ACP process for ${session.sessionId}`,
      );
      sessionInfo.acpProcess.kill("SIGTERM");
      sessionInfo.acpProcess = null;
    }

    const spawnResult = this.provider.spawn(sessionInfo.checkoutPath);
    const process = spawnResult.process;
    this.sessionManager.setSessionAcpProcess(session.sessionId, process);

    const acpCwd = session.agentSubpath
      ? join(sessionInfo.checkoutPath, session.agentSubpath)
      : sessionInfo.checkoutPath;

    // Create ACP client
    const acpClient = new AcpClient(this.provider, session.sessionId, {
      onThoughtStart: (sessionId) => {
        this.send({
          type: "thought_start",
          sessionId,
          timestamp: new Date().toISOString(),
        });
      },
      onThoughtChunk: (sessionId, content) => {
        this.send({
          type: "thought_chunk",
          sessionId,
          content,
          timestamp: new Date().toISOString(),
        });
      },
      onThoughtEnd: (sessionId) => {
        this.send({
          type: "thought_end",
          sessionId,
          timestamp: new Date().toISOString(),
        });
      },
      onMessageChunk: (sessionId, content) => {
        this.send({
          type: "message_chunk",
          sessionId,
          content,
          timestamp: new Date().toISOString(),
        });
      },
      onUsageUpdate: (sessionId, usage) => {
        this.send({
          type: "usage_update",
          sessionId,
          usage,
          timestamp: new Date().toISOString(),
        });
      },
      onGenericUpdate: (sessionId, content) => {
        this.send({
          type: "acp_response",
          sessionId,
          content,
          timestamp: new Date().toISOString(),
        });
      },
      onPermissionRequest: (sessionId, requestId, params) => {
        return new Promise((resolve) => {
          this.pendingPermissions.set(requestId, resolve);
          this.send({
            type: "permission_request",
            sessionId,
            requestId,
            toolCall: params.toolCall,
            options: params.options,
            timestamp: new Date().toISOString(),
          });
        });
      },
    });

    // Initialize ACP client with MCP servers
    acpClient
      .initialize(
        acpCwd,
        toWebWritable(spawnResult.stdin),
        toWebReadable(spawnResult.stdout),
        sessionInfo.acpSessionId,
        sessionInfo.mcpServers,
      )
      .then(async (result) => {
        logger.debug(`[mimo-agent] ACP client ready for ${session.sessionId}`);
        this.acpClients.set(session.sessionId, acpClient);

        // Restore model/mode from persisted session state if available
        if (sessionInfo.modelState && acpClient.modelState) {
          try {
            await acpClient.setModel(sessionInfo.modelState.currentModelId);
            logger.debug(
              `[mimo-agent] Restored model for ${session.sessionId}: ${sessionInfo.modelState.currentModelId}`,
            );
          } catch (err) {
            logger.warn(
              `[mimo-agent] Failed to restore model for ${session.sessionId}:`,
              err,
            );
          }
        }

        if (sessionInfo.modeState && acpClient.modeState) {
          try {
            await acpClient.setMode(sessionInfo.modeState.currentModeId);
            logger.debug(
              `[mimo-agent] Restored mode for ${session.sessionId}: ${sessionInfo.modeState.currentModeId}`,
            );
          } catch (err) {
            logger.warn(
              `[mimo-agent] Failed to restore mode for ${session.sessionId}:`,
              err,
            );
          }
        }

        // Update session state with actual ACP values
        this.sessionManager.setSessionState(
          session.sessionId,
          acpClient.modelState,
          acpClient.modeState,
        );

        // Send session initialized
        this.send({
          type: "session_initialized",
          sessionId: session.sessionId,
          modelState: acpClient.modelState,
          modeState: acpClient.modeState,
          timestamp: new Date().toISOString(),
        });

        // Send acp_session_created to platform
        this.send({
          type: "acp_session_created",
          sessionId: session.sessionId,
          acpSessionId: result.acpSessionId,
          wasReset: result.wasReset,
          resetReason: result.resetReason,
          timestamp: new Date().toISOString(),
        });
      })
      .catch((err) => {
        logger.error(
          `[mimo-agent] ACP init error for ${session.sessionId}:`,
          err,
        );
      });

    // Handle process events
    process.stderr?.on("data", (data: Buffer) => {
      logger.error(
        `[mimo-agent] ACP stderr (${session.sessionId}):`,
        data.toString(),
      );
    });

    process.on("close", (code: number | null) => {
      logger.debug(
        `[mimo-agent] ACP exited for ${session.sessionId} with code ${code}`,
      );
      this.acpClients.delete(session.sessionId);
      this.sessionManager.setSessionAcpProcess(session.sessionId, null);
    });

    process.on("error", (err: Error) => {
      logger.error(
        `[mimo-agent] ACP process error for ${session.sessionId}:`,
        err.message,
      );
      this.send({
        type: "session_error",
        sessionId: session.sessionId,
        error: `ACP process error: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private async respawnAcpProcess(
    sessionId: string,
    cachedState?: CachedAcpState,
  ): Promise<AcpClient | null> {
    const sessionInfo = this.sessionManager.getSession(sessionId);
    if (!sessionInfo) {
      throw new Error(`Session ${sessionId} not found`);
    }

    logger.debug(`[mimo-agent] Respawning ACP for ${sessionId}`);

    // Spawn ACP process
    const spawnResult = this.provider.spawn(sessionInfo.checkoutPath);
    const process = spawnResult.process;
    this.sessionManager.setSessionAcpProcess(sessionId, process);

    const acpCwd = sessionInfo.checkoutPath;

    // Create ACP client
    const acpClient = new AcpClient(this.provider, sessionId, {
      onThoughtStart: (sid) => {
        this.lifecycleManager.recordActivity(sid);
        this.send({
          type: "thought_start",
          sessionId: sid,
          timestamp: new Date().toISOString(),
        });
      },
      onThoughtChunk: (sid, content) => {
        this.lifecycleManager.recordActivity(sid);
        this.send({
          type: "thought_chunk",
          sessionId: sid,
          content,
          timestamp: new Date().toISOString(),
        });
      },
      onThoughtEnd: (sid) => {
        this.send({
          type: "thought_end",
          sessionId: sid,
          timestamp: new Date().toISOString(),
        });
      },
      onMessageChunk: (sid, content) => {
        this.lifecycleManager.recordActivity(sid);
        this.send({
          type: "message_chunk",
          sessionId: sid,
          content,
          timestamp: new Date().toISOString(),
        });
      },
      onUsageUpdate: (sid, usage) => {
        this.send({
          type: "usage_update",
          sessionId: sid,
          usage,
          timestamp: new Date().toISOString(),
        });
      },
      onGenericUpdate: (sid, content) => {
        this.send({
          type: "acp_response",
          sessionId: sid,
          content,
          timestamp: new Date().toISOString(),
        });
      },
      onPermissionRequest: (sid, requestId, params) => {
        return new Promise((resolve) => {
          this.pendingPermissions.set(requestId, resolve);
          this.send({
            type: "permission_request",
            sessionId: sid,
            requestId,
            toolCall: params.toolCall,
            options: params.options,
            timestamp: new Date().toISOString(),
          });
        });
      },
    });

    try {
      // Initialize with cached session ID and MCP servers if available
      const result = await acpClient.initialize(
        acpCwd,
        toWebWritable(spawnResult.stdin),
        toWebReadable(spawnResult.stdout),
        cachedState?.acpSessionId,
        sessionInfo.mcpServers,
      );

      logger.debug(`[mimo-agent] ACP respawned for ${sessionId}`);
      this.acpClients.set(sessionId, acpClient);

      // Restore model/mode from cache if available
      if (cachedState?.modelState && acpClient.modelState) {
        try {
          await acpClient.setModel(cachedState.modelState.currentModelId);
          logger.debug(
            `[mimo-agent] Restored model for ${sessionId}: ${cachedState.modelState.currentModelId}`,
          );
        } catch (err) {
          logger.warn(
            `[mimo-agent] Failed to restore model for ${sessionId}:`,
            err,
          );
        }
      }

      if (cachedState?.modeState && acpClient.modeState) {
        try {
          await acpClient.setMode(cachedState.modeState.currentModeId);
          logger.debug(
            `[mimo-agent] Restored mode for ${sessionId}: ${cachedState.modeState.currentModeId}`,
          );
        } catch (err) {
          logger.warn(
            `[mimo-agent] Failed to restore mode for ${sessionId}:`,
            err,
          );
        }
      }

      // Update session state
      this.sessionManager.setSessionState(
        sessionId,
        acpClient.modelState,
        acpClient.modeState,
      );

      // Send session initialized
      this.send({
        type: "session_initialized",
        sessionId,
        modelState: acpClient.modelState,
        modeState: acpClient.modeState,
        timestamp: new Date().toISOString(),
      });

      // If session was reset, notify
      if (result.wasReset) {
        this.send({
          type: "acp_session_created",
          sessionId,
          acpSessionId: result.acpSessionId,
          wasReset: true,
          resetReason: result.resetReason || "session_resumed",
          timestamp: new Date().toISOString(),
        });
      }

      // Handle process events
      process.stderr?.on("data", (data: Buffer) => {
        logger.error(
          `[mimo-agent] ACP stderr (${sessionId}):`,
          data.toString(),
        );
      });

      process.on("close", (code: number | null) => {
        logger.debug(
          `[mimo-agent] ACP exited for ${sessionId} with code ${code}`,
        );
        this.acpClients.delete(sessionId);
        this.sessionManager.setSessionAcpProcess(sessionId, null);
      });

      process.on("error", (err: Error) => {
        logger.error(
          `[mimo-agent] ACP process error for ${sessionId}:`,
          err.message,
        );
        this.send({
          type: "session_error",
          sessionId,
          error: `ACP process error: ${err.message}`,
          timestamp: new Date().toISOString(),
        });
      });

      return acpClient;
    } catch (err) {
      logger.error(`[mimo-agent] Failed to respawn ACP for ${sessionId}:`, err);
      throw err;
    }
  }

  private handleAcpRequest(message: any): void {
    const sessionId = message.sessionId;
    if (!sessionId) {
      logger.debug("[mimo-agent] No sessionId in acp_request");
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      logger.debug(`[mimo-agent] Unknown session ${sessionId}`);
      return;
    }

    logger.debug(`[mimo-agent] Restarting ACP for session ${sessionId}`);
    this.spawnAcpProcess(session).catch((err) => {
      logger.error(`[mimo-agent] Failed to restart ACP for ${sessionId}:`, err);
    });
  }

  private async handleCancelRequest(message: any): Promise<void> {
    const sessionId = message.sessionId;
    if (!sessionId) {
      logger.debug("[mimo-agent] No sessionId in cancel_request");
      return;
    }

    const acpClient = this.acpClients.get(sessionId);
    if (!acpClient) {
      logger.debug(`[mimo-agent] No ACP client for session ${sessionId}`);
      return;
    }

    logger.debug(`[mimo-agent] Cancelling prompt for ${sessionId}`);
    try {
      await acpClient.cancel();
    } catch (err: any) {
      logger.warn(
        `[mimo-agent] Cancel notification error for ${sessionId}:`,
        err.message,
      );
    }

    this.send({
      type: "acp_cancelled",
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  private handleFileSyncRequest(message: any): void {
    const sessionId = message.sessionId;
    logger.debug(
      `[mimo-agent] File sync for session ${sessionId || "unknown"}`,
    );
  }

  private handleSyncNow(message: any): void {
    const sessionId = message.sessionId;
    const requestId = message.requestId;

    if (!sessionId || !requestId) {
      this.send({
        type: "sync_now_result",
        sessionId,
        requestId,
        success: false,
        message: "Missing sessionId or requestId",
        error: "Missing sessionId or requestId",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.send({
        type: "sync_now_result",
        sessionId,
        requestId,
        success: false,
        message: "Session not found in mimo-agent",
        error: "Session not found in mimo-agent",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const runFossil = (args: string[]) => {
      const result = spawnSync("fossil", args, {
        cwd: session.checkoutPath,
        encoding: "utf8",
        timeout: 15000,
        env: {
          ...process.env,
          FOSSIL_FORCE_TTY: "0",
        },
      });

      if (result.error) {
        const err = result.error as Error & { code?: string };
        const timeoutMessage =
          err.code === "ETIMEDOUT"
            ? `fossil ${args.join(" ")} timed out`
            : err.message;

        return {
          success: false,
          output: (result.stdout || "").trim(),
          error: timeoutMessage,
        };
      }

      return {
        success: result.status === 0,
        output: (result.stdout || "").trim(),
        error: (result.stderr || "").trim(),
      };
    };

    try {
      const addremoveResult = runFossil(["addremove"]);
      if (!addremoveResult.success) {
        this.send({
          type: "sync_now_result",
          sessionId,
          requestId,
          success: false,
          message: "Failed to stage changes in fossil checkout",
          error:
            addremoveResult.error ||
            addremoveResult.output ||
            "fossil addremove failed",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const changesResult = runFossil(["changes"]);
      if (!changesResult.success) {
        this.send({
          type: "sync_now_result",
          sessionId,
          requestId,
          success: false,
          message: "Failed to inspect fossil changes",
          error:
            changesResult.error ||
            changesResult.output ||
            "fossil changes failed",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!changesResult.output) {
        this.send({
          type: "sync_now_result",
          sessionId,
          requestId,
          success: true,
          noChanges: true,
          message: "No changes to sync from mimo-agent fossil checkout",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const commitMessage = `agent-sync(${sessionId}): sync fossil changes ${new Date().toISOString()}`;
      const commitResult = runFossil(["commit", "-m", commitMessage]);
      if (!commitResult.success) {
        const combined = `${commitResult.output}\n${commitResult.error}`;
        if (combined.includes("nothing has changed")) {
          this.send({
            type: "sync_now_result",
            sessionId,
            requestId,
            success: true,
            noChanges: true,
            message: "No changes to sync from mimo-agent fossil checkout",
            timestamp: new Date().toISOString(),
          });
          return;
        }

        this.send({
          type: "sync_now_result",
          sessionId,
          requestId,
          success: false,
          message: "Failed to commit fossil changes",
          error:
            commitResult.error || commitResult.output || "fossil commit failed",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const pushResult = runFossil(["push"]);
      if (!pushResult.success) {
        this.send({
          type: "sync_now_result",
          sessionId,
          requestId,
          success: false,
          message: "Fossil committed but push failed",
          error: pushResult.error || pushResult.output || "fossil push failed",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      this.send({
        type: "sync_now_result",
        sessionId,
        requestId,
        success: true,
        message: "mimo-agent fossil commit and push completed",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.send({
        type: "sync_now_result",
        sessionId,
        requestId,
        success: false,
        message: "Failed to sync from mimo-agent fossil checkout",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleUserMessage(message: any): Promise<void> {
    const sessionId = message.sessionId;
    const content = message.content;

    if (!sessionId) {
      logger.debug("[mimo-agent] No sessionId in user_message");
      return;
    }

    // Check session state via lifecycle manager
    const sessionState = this.lifecycleManager.getSessionState(sessionId);

    if (sessionState === "parked") {
      // Session is parked, need to wake it up
      logger.debug(`[mimo-agent] Session ${sessionId} is parked, waking up...`);
      try {
        await this.lifecycleManager.queuePrompt(sessionId, content);
        // After waking, get the ACP client (it should now exist)
        const acpClient = this.acpClients.get(sessionId);
        if (!acpClient) {
          throw new Error("ACP client not available after wake-up");
        }
        await this.sendPrompt(acpClient, sessionId, content);
      } catch (err) {
        logger.error(`[mimo-agent] Failed to wake session ${sessionId}:`, err);
        this.send({
          type: "error_response",
          sessionId,
          error: `Failed to wake session: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    if (sessionState === "waking") {
      // Session is waking, queue the prompt
      logger.debug(
        `[mimo-agent] Session ${sessionId} is waking, queueing prompt...`,
      );
      try {
        await this.lifecycleManager.queuePrompt(sessionId, content);
        await this.sendPrompt(
          this.acpClients.get(sessionId)!,
          sessionId,
          content,
        );
      } catch (err) {
        logger.error(
          `[mimo-agent] Failed to queue prompt for ${sessionId}:`,
          err,
        );
        this.send({
          type: "error_response",
          sessionId,
          error: `Failed to queue prompt: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    // Normal active session flow
    const acpClient = this.acpClients.get(sessionId);
    if (!acpClient) {
      logger.debug(`[mimo-agent] No ACP client for session ${sessionId}`);
      this.send({
        type: "error_response",
        sessionId,
        error: `No ACP connection for session: ${sessionId}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Record activity for idle timeout tracking
    this.lifecycleManager.recordActivity(sessionId);
    await this.sendPrompt(acpClient, sessionId, content);
  }

  private async sendPrompt(
    acpClient: AcpClient,
    sessionId: string,
    content: string,
  ): Promise<void> {
    logger.debug(`[mimo-agent] Sending prompt for session ${sessionId}`);
    this.send({
      type: "prompt_received",
      sessionId,
      timestamp: new Date().toISOString(),
    });

    try {
      await acpClient.prompt(content);
      logger.debug(`[mimo-agent] Prompt completed for ${sessionId}`);
    } catch (err) {
      logger.error(`[mimo-agent] Prompt error:`, err);
      this.send({
        type: "error_response",
        sessionId,
        error: `ACP prompt error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleSetModel(message: any): Promise<void> {
    const { sessionId, modelId } = message;
    logger.debug(`[mimo-agent] Set model for ${sessionId}: ${modelId}`);

    const acpClient = this.acpClients.get(sessionId);
    if (!acpClient) {
      logger.debug(`[mimo-agent] No ACP client for session ${sessionId}`);
      return;
    }

    try {
      await acpClient.setModel(modelId);

      this.send({
        type: "model_state",
        sessionId,
        modelState: acpClient.modelState,
        timestamp: new Date().toISOString(),
      });

      logger.debug(`[mimo-agent] Model changed to ${modelId}`);
    } catch (err: any) {
      logger.error(`[mimo-agent] Failed to set model:`, err);
      this.send({
        type: "error_response",
        sessionId,
        error: `Failed to set model: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleSetMode(message: any): Promise<void> {
    const { sessionId, modeId } = message;
    logger.debug(`[mimo-agent] Set mode for ${sessionId}: ${modeId}`);

    const acpClient = this.acpClients.get(sessionId);
    if (!acpClient) {
      logger.debug(`[mimo-agent] No ACP client for session ${sessionId}`);
      return;
    }

    try {
      await acpClient.setMode(modeId);

      this.send({
        type: "mode_state",
        sessionId,
        modeState: acpClient.modeState,
        timestamp: new Date().toISOString(),
      });

      logger.debug(`[mimo-agent] Mode changed to ${modeId}`);
    } catch (err: any) {
      logger.error(`[mimo-agent] Failed to set mode:`, err);
      this.send({
        type: "error_response",
        sessionId,
        error: `Failed to set mode: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private handleRequestState(message: any): void {
    const { sessionId } = message;
    const acpClient = this.acpClients.get(sessionId);

    if (!acpClient) {
      logger.debug(
        `[mimo-agent] Unknown session ${sessionId} in request_state`,
      );
      return;
    }

    this.send({
      type: "session_initialized",
      sessionId,
      modelState: acpClient.modelState,
      modeState: acpClient.modeState,
      timestamp: new Date().toISOString(),
    });

    logger.debug(`[mimo-agent] Sent state for session ${sessionId}`);
  }

  private handlePermissionResponse(message: any): void {
    const { requestId, outcome } = message;
    const resolver = this.pendingPermissions.get(requestId);
    if (resolver) {
      this.pendingPermissions.delete(requestId);
      resolver({ outcome });
    }
  }

  private async handleClearSession(message: any): Promise<void> {
    const { sessionId } = message;

    if (!sessionId) {
      logger.debug("[mimo-agent] No sessionId in clear_session");
      this.send({
        type: "clear_session_error",
        sessionId,
        error: "No sessionId provided",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.debug(`[mimo-agent] Clearing session ${sessionId}`);

    const acpClient = this.acpClients.get(sessionId);
    if (!acpClient) {
      logger.debug(`[mimo-agent] No ACP client for session ${sessionId}`);
      this.send({
        type: "clear_session_error",
        sessionId,
        error: "No ACP client for session",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      const result = await acpClient.clear();

      logger.debug(
        `[mimo-agent] Session ${sessionId} cleared, new ACP session: ${result.acpSessionId}`,
      );

      // Send success message to platform
      this.send({
        type: "acp_session_cleared",
        sessionId,
        acpSessionId: result.acpSessionId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(`[mimo-agent] Failed to clear session ${sessionId}:`, error);

      // Send error message to platform
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.send({
        type: "clear_session_error",
        sessionId,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private handleSessionEnded(message: any): void {
    const sessionId = message.sessionId;
    if (!sessionId) {
      logger.debug("[mimo-agent] No sessionId in session_ended");
      return;
    }

    logger.debug(`[mimo-agent] Session ended: ${sessionId}`);

    // Remove from acpClients - idempotent if doesn't exist
    this.acpClients.delete(sessionId);

    // Terminate session - handles process, watcher, timers
    this.sessionManager.terminateSession(sessionId);
  }

  private handleSessionConfigUpdated(message: any): void {
    const { sessionId, config } = message;

    if (!sessionId) {
      logger.debug("[mimo-agent] No sessionId in session_config_updated");
      return;
    }

    logger.debug(
      `[mimo-agent] Session config updated for ${sessionId}:`,
      config,
    );

    // Update lifecycle manager with new idle timeout
    if (config.idleTimeoutMs !== undefined) {
      this.lifecycleManager.updateIdleTimeout(sessionId, config.idleTimeoutMs);
    }
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay =
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      logger.debug(
        `[mimo-agent] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`,
      );

      setTimeout(() => {
        this.connect().catch((error) => {
          logger.error("[mimo-agent] Reconnect failed:", error.message);
        });
      }, delay);
    } else {
      logger.error("[mimo-agent] Max reconnect attempts reached");
      process.exit(1);
    }
  }

  private send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      logger.debug("[mimo-agent] WebSocket not connected");
    }
  }

  private setupShutdownHandlers(): void {
    const shutdown = () => {
      logger.debug("[mimo-agent] Shutting down...");
      this.sessionManager.terminateAll();
      this.ws?.close();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    process.on("SIGUSR2", shutdown);

    process.on("uncaughtException", (error) => {
      logger.error("[mimo-agent] Uncaught exception:", error);
      shutdown();
    });
  }
}

const agent = new MimoAgent();
agent.start().catch((error) => {
  logger.error("[mimo-agent] Failed to start:", error.message);
  process.exit(1);
});
