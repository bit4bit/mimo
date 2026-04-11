import { WebSocket } from "ws";
import { ChildProcess, execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Readable, Writable } from "node:stream";
import { AgentConfig } from "./types";
import { SessionManager } from "./session";
import { AcpClient, OpencodeProvider, ClaudeAgentProvider } from "./acp";
import type { IAcpProvider } from "./acp";

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
    if (this.config.provider === "claude") {
      this.provider = new ClaudeAgentProvider();
    } else {
      this.provider = new OpencodeProvider();
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
      console.log(`[mimo-agent] Created workDir: ${config.workDir}`);
    }

    if (!config.provider) {
      config.provider = "opencode";
    } else if (config.provider !== "opencode" && config.provider !== "claude") {
      console.error(`[mimo-agent] Unknown provider: "${config.provider}". Valid values: opencode, claude`);
      process.exit(1);
    }

    return config as AgentConfig;
  }

  async start(): Promise<void> {
    console.log("[mimo-agent] Starting...");
    console.log(`[mimo-agent] Platform: ${this.config.platform}`);
    console.log(`[mimo-agent] WorkDir: ${this.config.workDir}`);

    await this.connect();
    this.setupShutdownHandlers();
  }

  private async connect(): Promise<void> {
    const wsUrl = `${this.config.platform}?token=${this.config.token}`;

    return new Promise((resolve, reject) => {
      console.log(`[mimo-agent] Connecting to ${this.config.platform}...`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on("open", () => {
        console.log("[mimo-agent] Connected to platform");
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
          console.error("[mimo-agent] Failed to parse message:", error);
        }
      });

      this.ws.on("close", () => {
        console.log("[mimo-agent] Disconnected");
        this.handleDisconnect();
      });

      this.ws.on("error", (error: Error) => {
        console.error("[mimo-agent] WebSocket error:", error.message);
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

      default:
        console.log("[mimo-agent] Unknown message type:", message.type);
    }
  }

  private async handleSessionReady(message: any): Promise<void> {
    const { platformUrl, sessions } = message;

    if (!sessions || sessions.length === 0) {
      console.log("[mimo-agent] No sessions assigned");
      return;
    }

    console.log(`[mimo-agent] Received ${sessions.length} session(s)`);
    const sessionIds: string[] = [];

    for (const session of sessions) {
      const { sessionId, fossilUrl, agentWorkspaceUser, agentWorkspacePassword, acpSessionId, localDevMirrorPath, agentSubpath } = session;

      try {
        const checkoutPath = join(this.config.workDir, sessionId);
        
        if (!fossilUrl) {
          throw new Error("No fossilUrl provided in session data");
        }

        console.log(`[mimo-agent] Using fossil URL: ${fossilUrl}`);

        // Setup checkout directory with credentials
        await this.setupCheckout(sessionId, checkoutPath, fossilUrl, agentWorkspaceUser, agentWorkspacePassword);

        // Create session with credentials
        const sessionInfo = await this.sessionManager.createSession(
          sessionId,
          fossilUrl,
          agentWorkspaceUser,
          agentWorkspacePassword
        );

        // Store acpSessionId for later use during ACP init
        if (acpSessionId) {
          this.sessionManager.setSessionAcpSessionId(sessionId, acpSessionId);
        }

        // Store localDevMirrorPath for file sync
        if (localDevMirrorPath) {
          this.sessionManager.setSessionLocalDevMirrorPath(sessionId, localDevMirrorPath);
        }

        // Spawn ACP process
        this.spawnAcpProcess({ ...sessionInfo, agentSubpath: agentSubpath || undefined });

        sessionIds.push(sessionId);
        console.log(`[mimo-agent] Session ${sessionId} ready`);
      } catch (error) {
        console.error(
          `[mimo-agent] Failed to setup session ${sessionId}:`,
          error
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
    agentWorkspacePassword?: string
  ): Promise<void> {
    const repoPath = join(checkoutPath, "..", `${sessionId}.fossil`);

    if (existsSync(repoPath)) {
      console.log(`[mimo-agent]   Fossil repo exists, opening`);
      if (!existsSync(checkoutPath)) {
        mkdirSync(checkoutPath, { recursive: true });
      }
      try {
        execSync(`fossil open ${repoPath}`, { cwd: checkoutPath, stdio: "pipe" });
      } catch {
        // Already open or error, continue
      }
      // Update remote URL to new port/credentials
      if (agentWorkspaceUser && agentWorkspacePassword) {
        const url = new URL(fossilUrl);
        url.username = agentWorkspaceUser;
        url.password = agentWorkspacePassword;
        const remoteUrl = url.toString();
        console.log(`[mimo-agent]   Updating remote URL to: ${url.protocol}//${url.username}:****@${url.host}/`);
        try {
          execSync(`fossil remote-url ${remoteUrl}`, { cwd: checkoutPath, stdio: "pipe" });
        } catch {
          // Ignore error, may already be correct
        }
        // Ensure local password matches server password
        try {
          execSync(
            `fossil user password ${agentWorkspaceUser} ${agentWorkspacePassword}`,
            { cwd: checkoutPath, stdio: "pipe" }
          );
          console.log(`[mimo-agent]   Updated local user password`);
        } catch {
          // Ignore error
        }
        // Update/add named remote "server" with credentials
        try {
          // Remove existing remote if exists, then add new one
          try {
            execSync(`fossil remote rm server`, { cwd: checkoutPath, stdio: "pipe" });
          } catch {
            // Remote may not exist, ignore
          }
          execSync(
            `fossil remote add server ${remoteUrl}`,
            { cwd: checkoutPath, stdio: "pipe" }
          );
          console.log(`[mimo-agent]   Updated remote 'server'`);
          // Do a sync using the named remote to verify credentials work
          execSync(
            `fossil sync server`,
            { cwd: checkoutPath, stdio: "pipe" }
          );
          console.log(`[mimo-agent]   Verified sync with remote 'server'`);
        } catch {
          // Ignore error
        }
      }
    } else if (existsSync(join(checkoutPath, ".fossil"))) {
      console.log(`[mimo-agent]   Checkout exists, ensuring open`);
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
        console.log(`[mimo-agent]   Updating remote URL to: ${url.protocol}//${url.username}:****@${url.host}/`);
        try {
          execSync(`fossil remote-url ${remoteUrl}`, { cwd: checkoutPath, stdio: "pipe" });
        } catch {
          // Ignore error, may already be correct
        }
        // Ensure local password matches server password
        try {
          execSync(
            `fossil user password ${agentWorkspaceUser} ${agentWorkspacePassword}`,
            { cwd: checkoutPath, stdio: "pipe" }
          );
          console.log(`[mimo-agent]   Updated local user password`);
        } catch {
          // Ignore error
        }
        // Update/add named remote "server" with credentials
        try {
          // Remove existing remote if exists, then add new one
          try {
            execSync(`fossil remote rm server`, { cwd: checkoutPath, stdio: "pipe" });
          } catch {
            // Remote may not exist, ignore
          }
          execSync(
            `fossil remote add server ${remoteUrl}`,
            { cwd: checkoutPath, stdio: "pipe" }
          );
          console.log(`[mimo-agent]   Updated remote 'server'`);
          // Do a sync using the named remote to verify credentials work
          execSync(
            `fossil sync server`,
            { cwd: checkoutPath, stdio: "pipe" }
          );
          console.log(`[mimo-agent]   Verified sync with remote 'server'`);
        } catch {
          // Ignore error
        }
      }
    } else {
      console.log(`[mimo-agent]   Cloning from fossil`);
      // Use credentials in URL if available
      let cloneUrl = fossilUrl;
      if (agentWorkspaceUser && agentWorkspacePassword) {
        const url = new URL(fossilUrl);
        url.username = agentWorkspaceUser;
        url.password = agentWorkspacePassword;
        cloneUrl = url.toString();
        console.log(`[mimo-agent]   Using authenticated URL: ${url.protocol}//${url.username}:****@${url.host}/`);
      }
      execSync(`fossil clone ${cloneUrl} ${repoPath}`, { stdio: "pipe" });
      if (!existsSync(checkoutPath)) {
        mkdirSync(checkoutPath, { recursive: true });
      }
      // Open without sync first, then set remote with credentials
      execSync(`fossil open --nosync ${repoPath}`, { cwd: checkoutPath, stdio: "pipe" });
      // Set remote URL with credentials for future syncs
      execSync(`fossil remote-url ${cloneUrl}`, { cwd: checkoutPath, stdio: "pipe" });
      // Set local password to match server password (fossil creates local admin with random password)
      if (agentWorkspaceUser && agentWorkspacePassword) {
        execSync(
          `fossil user password ${agentWorkspaceUser} ${agentWorkspacePassword}`,
          { cwd: checkoutPath, stdio: "pipe" }
        );
        // Add a named remote "server" with credentials embedded
        execSync(
          `fossil remote add server ${cloneUrl}`,
          { cwd: checkoutPath, stdio: "pipe" }
        );
        // Do an initial sync using the named remote with credentials
        execSync(
          `fossil sync server`,
          { cwd: checkoutPath, stdio: "pipe" }
        );
      }
    }
  }

  private spawnAcpProcess(session: any): void {
    const sessionInfo = this.sessionManager.getSession(session.sessionId);
    if (!sessionInfo) return;

    // Terminate existing
    if (sessionInfo.acpProcess) {
      console.log(
        `[mimo-agent] Terminating existing ACP for ${session.sessionId}`
      );
      sessionInfo.acpProcess.kill();
    }

    const spawnResult = this.provider.spawn(sessionInfo.checkoutPath);
    const process = spawnResult.process;
    this.sessionManager.setSessionAcpProcess(session.sessionId, process);

    const acpCwd = session.agentSubpath
      ? join(sessionInfo.checkoutPath, session.agentSubpath)
      : sessionInfo.checkoutPath;

    // Create ACP client
    const acpClient = new AcpClient(
      this.provider,
      session.sessionId,
      {
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
      }
    );

    // Initialize ACP client
    acpClient
      .initialize(
        acpCwd,
        toWebWritable(spawnResult.stdin),
        toWebReadable(spawnResult.stdout),
        sessionInfo.acpSessionId
      )
      .then((result) => {
        console.log(`[mimo-agent] ACP client ready for ${session.sessionId}`);
        this.acpClients.set(session.sessionId, acpClient);

        // Update session state
        this.sessionManager.setSessionState(
          session.sessionId,
          acpClient.modelState,
          acpClient.modeState
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
        console.error(
          `[mimo-agent] ACP init error for ${session.sessionId}:`,
          err
        );
      });

    // Handle process events
    process.stderr?.on("data", (data: Buffer) => {
      console.error(
        `[mimo-agent] ACP stderr (${session.sessionId}):`,
        data.toString()
      );
    });

    process.on("close", (code: number | null) => {
      console.log(
        `[mimo-agent] ACP exited for ${session.sessionId} with code ${code}`
      );
      this.acpClients.delete(session.sessionId);
      this.sessionManager.setSessionAcpProcess(session.sessionId, null);
    });

    process.on("error", (err: Error) => {
      console.error(
        `[mimo-agent] ACP process error for ${session.sessionId}:`,
        err.message
      );
      this.send({
        type: "session_error",
        sessionId: session.sessionId,
        error: `ACP process error: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private handleAcpRequest(message: any): void {
    const sessionId = message.sessionId;
    if (!sessionId) {
      console.log("[mimo-agent] No sessionId in acp_request");
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      console.log(`[mimo-agent] Unknown session ${sessionId}`);
      return;
    }

    console.log(`[mimo-agent] Restarting ACP for session ${sessionId}`);
    this.spawnAcpProcess(session);
  }

  private async handleCancelRequest(message: any): Promise<void> {
    const sessionId = message.sessionId;
    if (!sessionId) {
      console.log("[mimo-agent] No sessionId in cancel_request");
      return;
    }

    const acpClient = this.acpClients.get(sessionId);
    if (!acpClient) {
      console.log(`[mimo-agent] No ACP client for session ${sessionId}`);
      return;
    }

    console.log(`[mimo-agent] Cancelling prompt for ${sessionId}`);
    try {
      await acpClient.cancel();
    } catch (err: any) {
      console.warn(`[mimo-agent] Cancel notification error for ${sessionId}:`, err.message);
    }

    this.send({
      type: "acp_cancelled",
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  private handleFileSyncRequest(message: any): void {
    const sessionId = message.sessionId;
    console.log(
      `[mimo-agent] File sync for session ${sessionId || "unknown"}`
    );
  }

  private handleUserMessage(message: any): void {
    const sessionId = message.sessionId;
    const content = message.content;

    if (!sessionId) {
      console.log("[mimo-agent] No sessionId in user_message");
      return;
    }

    const acpClient = this.acpClients.get(sessionId);
    if (!acpClient) {
      console.log(`[mimo-agent] No ACP client for session ${sessionId}`);
      this.send({
        type: "error_response",
        sessionId,
        error: `No ACP connection for session: ${sessionId}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    console.log(`[mimo-agent] Sending prompt for session ${sessionId}`);
    this.send({
      type: "prompt_received",
      sessionId,
      timestamp: new Date().toISOString(),
    });
    acpClient
      .prompt(content)
      .then(() => {
        console.log(`[mimo-agent] Prompt completed for ${sessionId}`);
      })
      .catch((err) => {
        console.error(`[mimo-agent] Prompt error:`, err);
        this.send({
          type: "error_response",
          sessionId,
          error: `ACP prompt error: ${err.message}`,
          timestamp: new Date().toISOString(),
        });
      });
  }

  private async handleSetModel(message: any): Promise<void> {
    const { sessionId, modelId } = message;
    console.log(`[mimo-agent] Set model for ${sessionId}: ${modelId}`);

    const acpClient = this.acpClients.get(sessionId);
    if (!acpClient) {
      console.log(`[mimo-agent] No ACP client for session ${sessionId}`);
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

      console.log(`[mimo-agent] Model changed to ${modelId}`);
    } catch (err: any) {
      console.error(`[mimo-agent] Failed to set model:`, err);
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
    console.log(`[mimo-agent] Set mode for ${sessionId}: ${modeId}`);

    const acpClient = this.acpClients.get(sessionId);
    if (!acpClient) {
      console.log(`[mimo-agent] No ACP client for session ${sessionId}`);
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

      console.log(`[mimo-agent] Mode changed to ${modeId}`);
    } catch (err: any) {
      console.error(`[mimo-agent] Failed to set mode:`, err);
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
      console.log(`[mimo-agent] Unknown session ${sessionId} in request_state`);
      return;
    }

    this.send({
      type: "session_initialized",
      sessionId,
      modelState: acpClient.modelState,
      modeState: acpClient.modeState,
      timestamp: new Date().toISOString(),
    });

    console.log(`[mimo-agent] Sent state for session ${sessionId}`);
  }

  private handlePermissionResponse(message: any): void {
    const { requestId, outcome } = message;
    const resolver = this.pendingPermissions.get(requestId);
    if (resolver) {
      this.pendingPermissions.delete(requestId);
      resolver({ outcome });
    }
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(
        `[mimo-agent] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`
      );

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error("[mimo-agent] Reconnect failed:", error.message);
        });
      }, delay);
    } else {
      console.error("[mimo-agent] Max reconnect attempts reached");
      process.exit(1);
    }
  }

  private send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.log("[mimo-agent] WebSocket not connected");
    }
  }

  private setupShutdownHandlers(): void {
    const shutdown = () => {
      console.log("[mimo-agent] Shutting down...");
      this.sessionManager.terminateAll();
      this.ws?.close();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    process.on("SIGUSR2", shutdown);

    process.on("uncaughtException", (error) => {
      console.error("[mimo-agent] Uncaught exception:", error);
      shutdown();
    });
  }
}

const agent = new MimoAgent();
agent.start().catch((error) => {
  console.error("[mimo-agent] Failed to start:", error.message);
  process.exit(1);
});
