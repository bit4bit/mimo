import { WebSocket } from "ws";
import { spawn, ChildProcess, execSync } from "child_process";
import { watch, existsSync, mkdirSync } from "fs";
import { join } from "path";
import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";

interface AgentConfig {
  token: string;
  platform: string;
  workDir: string;
}

interface SessionInfo {
  sessionId: string;
  checkoutPath: string;
  fossilUrl: string;
  acpProcess: ChildProcess | null;
  fileWatcher: ReturnType<typeof watch> | null;
  acpConnection?: acp.ClientSideConnection;
  acpSessionId?: string;
  currentThoughtBuffer?: string;
  modelState?: ModelState;
  modeState?: ModeState;
}

interface ModelState {
  currentModelId: string;
  availableModels: Array<{ value: string; name: string; description?: string }>;
  optionId: string;
}

interface ModeState {
  currentModeId: string;
  availableModes: Array<{ value: string; name: string; description?: string }>;
  optionId: string;
}

interface FileChange {
  path: string;
  isNew?: boolean;
  deleted?: boolean;
}

class MimoAgent {
  private ws: WebSocket | null = null;
  private config: AgentConfig;
  private sessions: Map<string, SessionInfo> = new Map();
  private pendingChanges: FileChange[] = [];
  private changeTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor() {
    this.config = this.parseArgs();
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
      }
    }

    if (!config.token) {
      throw new Error("Missing required argument: --token");
    }
    if (!config.platform) {
      throw new Error("Missing required argument: --platform");
    }

    // Default workDir to current directory if not specified
    if (!config.workDir) {
      config.workDir = process.cwd();
    }

    return config as AgentConfig;
  }

  async start(): Promise<void> {
    console.log("[mimo-agent] Starting...");
    console.log(`[mimo-agent] Platform: ${this.config.platform}`);
    console.log(`[mimo-agent] WorkDir: ${this.config.workDir}`);

    // Connect to platform
    await this.connect();

    // Handle graceful shutdown
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
        
        // Send agent_ready message with workdir
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

      this.ws.on("close", (code: number, reason: Buffer) => {
        console.log(`[mimo-agent] Disconnected (code: ${code})`);
        this.handleDisconnect();
      });

      this.ws.on("error", (error: Error) => {
        console.error("[mimo-agent] WebSocket error:", error.message);
        reject(error);
      });

      // Connection timeout
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
      const { sessionId, port } = session;
      
      try {
        // Checkout path is {workdir}/{sessionId}
        const checkoutPath = join(this.config.workDir, sessionId);
        // Parse platformUrl to get just the host, then add port
        const platformHost = platformUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const fossilUrl = `http://${platformHost.split(':')[0]}:${port}/`;
        
        console.log(`[mimo-agent] Setting up session ${sessionId}`);
        console.log(`[mimo-agent]   Fossil URL: ${fossilUrl}`);
        console.log(`[mimo-agent]   Checkout: ${checkoutPath}`);

        // Clone from fossil server
        const repoPath = join(checkoutPath, "..", `${sessionId}.fossil`);
        
        if (existsSync(repoPath)) {
          console.log(`[mimo-agent]   Fossil repo already exists, opening checkout`);
          // Create checkout directory if needed
          if (!existsSync(checkoutPath)) {
            mkdirSync(checkoutPath, { recursive: true });
          }
          
          // Open existing repo
          try {
            execSync(`fossil open ${repoPath}`, {
              cwd: checkoutPath,
              stdio: "pipe",
            });
          } catch {
            // Already open or other error, continue
          }
        } else if (existsSync(join(checkoutPath, ".fossil"))) {
          console.log(`[mimo-agent]   Checkout already exists, ensuring open`);
          // Checkout already exists, make sure it's open
          try {
            execSync(`fossil open`, {
              cwd: checkoutPath,
              stdio: "pipe",
            });
          } catch {
            // Already open or other error, continue
          }
        } else {
          console.log(`[mimo-agent]   Cloning from fossil`);
          // Clone from fossil server
          execSync(`fossil clone ${fossilUrl} ${repoPath}`, {
            stdio: "pipe",
          });
          
          // Create checkout directory and open
          if (!existsSync(checkoutPath)) {
            mkdirSync(checkoutPath, { recursive: true });
          }
          
          execSync(`fossil open ${repoPath}`, {
            cwd: checkoutPath,
            stdio: "pipe",
          });
        }

        // Store session info (will update acpProcess after spawn)
        const sessionInfo: SessionInfo = {
          sessionId,
          checkoutPath,
          fossilUrl,
          acpProcess: null,
          fileWatcher: null,
        };
        this.sessions.set(sessionId, sessionInfo);

        // Spawn ACP process in checkout directory
        console.log(`[mimo-agent]   Spawning ACP process (opencode acp)`);
        this.spawnAcpProcess(sessionInfo);

        // Start file watcher for this session
        this.startFileWatcher(sessionId, checkoutPath);

        sessionIds.push(sessionId);
        console.log(`[mimo-agent] Session ${sessionId} ready`);
      } catch (error) {
        console.error(`[mimo-agent] Failed to setup session ${sessionId}:`, error);
        this.send({
          type: "session_error",
          sessionId,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Send confirmation to platform
    this.send({
      type: "agent_sessions_ready",
      sessionIds,
      timestamp: new Date().toISOString(),
    });
  }

  private startFileWatcher(sessionId: string, checkoutPath: string): void {
    console.log(`[mimo-agent] Starting file watcher for session ${sessionId}`);

    const watcher = watch(
      checkoutPath,
      { recursive: true },
      (eventType: string, filename: string | null) => {
        if (!filename) return;
        
        // Skip hidden files and common ignore patterns
        if (filename.startsWith(".") || filename.includes("/.") || 
            filename.includes("node_modules") || filename.includes("__pycache__") ||
            filename.endsWith(".tmp") || filename.endsWith("~")) {
          return;
        }

        const change: FileChange = {
          path: filename,
          isNew: eventType === "rename",
          deleted: false,
        };

        this.pendingChanges.push(change);
        
        if (this.changeTimeout) {
          clearTimeout(this.changeTimeout);
        }
        
        this.changeTimeout = setTimeout(() => {
          this.flushPendingChanges(sessionId);
        }, 500);
      }
    );

    const session = this.sessions.get(sessionId);
    if (session) {
      session.fileWatcher = watcher;
    }
  }

  private flushPendingChanges(sessionId: string): void {
    if (this.pendingChanges.length === 0) return;

    const changes = [...this.pendingChanges];
    this.pendingChanges = [];

    // Deduplicate changes
    const uniqueChanges = new Map<string, FileChange>();
    for (const change of changes) {
      uniqueChanges.set(change.path, change);
    }

    this.send({
      type: "file_changed",
      sessionId,
      files: Array.from(uniqueChanges.values()),
      timestamp: new Date().toISOString(),
    });
  }

  private spawnAcpProcess(session: SessionInfo): void {
    if (session.acpProcess) {
      console.log(`[mimo-agent] Terminating existing ACP process for ${session.sessionId}`);
      session.acpProcess.kill();
      session.acpProcess = null;
    }

    const acpCommand = "opencode";
    const acpArgs = ["acp"];

    console.log(`[mimo-agent] Spawning ACP: ${acpCommand} ${acpArgs.join(" ")}`);
    console.log(`[mimo-agent]   Working directory: ${session.checkoutPath}`);

    const process = spawn(acpCommand, acpArgs, {
      cwd: session.checkoutPath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    session.acpProcess = process;

    // Create ACP stream for stdio
    const input = Writable.toWeb(process.stdin!);
    const output = Readable.toWeb(process.stdout!);
    const stream = acp.ndJsonStream(input, output);

    // Create client-side connection
    const client: acp.Client = {
      requestPermission: async (params) => {
        // Auto-approve for now - you might want to route this to the platform
        return {
          outcome: { outcome: "approved", optionId: "allow" },
        };
      },
      sessionUpdate: async (params) => {
        const update = params.update as any;
        const updateType = update?.sessionUpdate;

        // Skip available_commands_update for now
        if (updateType === "available_commands_update") {
          return;
        }

        // Parse and route different update types
        if (updateType === "agent_thought_chunk") {
          // Group thoughts - send start on first chunk
          if (!session.currentThoughtBuffer) {
            session.currentThoughtBuffer = "";
            this.send({
              type: "thought_start",
              sessionId: session.sessionId,
              timestamp: new Date().toISOString(),
            });
          }
          session.currentThoughtBuffer += update.content?.text || "";
          this.send({
            type: "thought_chunk",
            sessionId: session.sessionId,
            content: update.content?.text || "",
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (updateType === "agent_message_chunk") {
          // If we were buffering thoughts, end them first
          if (session.currentThoughtBuffer) {
            this.send({
              type: "thought_end",
              sessionId: session.sessionId,
              timestamp: new Date().toISOString(),
            });
            session.currentThoughtBuffer = "";
          }
          this.send({
            type: "message_chunk",
            sessionId: session.sessionId,
            content: update.content?.text || "",
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (updateType === "usage_update") {
          this.send({
            type: "usage_update",
            sessionId: session.sessionId,
            usage: {
              cost: update.cost || {},
              size: update.size,
              used: update.used,
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Fallback for other update types - send minimal info
        this.send({
          type: "acp_response",
          sessionId: session.sessionId,
          content: updateType || "update",
          timestamp: new Date().toISOString(),
        });
      },
    };

    session.acpConnection = new acp.ClientSideConnection(() => client, stream);

    // Initialize the ACP connection
    session.acpConnection
      .initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientInfo: { name: "mimo-agent", version: "0.1.0" },
      })
      .then((response) => {
        console.log(`[mimo-agent] ACP initialized for ${session.sessionId}:`, response.protocolVersion);
        
        // Create session - mcpServers is required by schema
        return session.acpConnection!.newSession({
          cwd: session.checkoutPath,
          mcpServers: [],
        });
      })
      .then((sessionResponse) => {
        session.acpSessionId = sessionResponse.sessionId;
        console.log(`[mimo-agent] ACP session created: ${sessionResponse.sessionId}`);
        
        // DEBUG: Log full response
        console.log(`[mimo-agent] sessionResponse keys:`, Object.keys(sessionResponse));
        
        // Extract model and mode state from configOptions (modern) or legacy fields
        if (sessionResponse.configOptions) {
          console.log(`[mimo-agent] Using modern configOptions format`);
          const modelConfig = sessionResponse.configOptions.find(
            (opt) => opt.category === "model" && opt.type === "select"
          );
          const modeConfig = sessionResponse.configOptions.find(
            (opt) => opt.category === "mode" && opt.type === "select"
          );
          
          if (modelConfig && modelConfig.type === "select") {
            const availableOptions = Array.isArray(modelConfig.options)
              ? modelConfig.options.map((opt: any) => ({
                  value: opt.value,
                  name: opt.name,
                  description: opt.description,
                }))
              : [];
            
            const currentModelId = modelConfig.currentValue || (availableOptions[0]?.value ?? "");
            
            session.modelState = {
              currentModelId,
              availableModels: availableOptions,
              optionId: modelConfig.id,
            };
            
            console.log(`[mimo-agent] Model state: ${currentModelId} (${availableOptions.length} available)`);
          }
          
          if (modeConfig && modeConfig.type === "select") {
            const availableOptions = Array.isArray(modeConfig.options)
              ? modeConfig.options.map((opt: any) => ({
                  value: opt.value,
                  name: opt.name,
                  description: opt.description,
                }))
              : [];
            
            const currentModeId = modeConfig.currentValue || (availableOptions[0]?.value ?? "");
            
            session.modeState = {
              currentModeId,
              availableModes: availableOptions,
              optionId: modeConfig.id,
            };
            
            console.log(`[mimo-agent] Mode state: ${currentModeId} (${availableOptions.length} available)`);
          }
        } 
        // Fallback to legacy fields (models/modes)
        else if (sessionResponse.models) {
          console.log(`[mimo-agent] Using legacy models/modes format`);
          
          // Extract model state from legacy 'models' field
          if (sessionResponse.models) {
            const models = sessionResponse.models;
            const availableOptions = Array.isArray(models.availableModels)
              ? models.availableModels.map((m: any) => ({
                  value: m.modelId || m.id,
                  name: m.name || m.modelId || m.id,
                  description: m.description,
                }))
              : [];
            
            const currentModelId = models.currentModelId || (availableOptions[0]?.value ?? "");
            
            session.modelState = {
              currentModelId,
              availableModels: availableOptions,
              optionId: "model",  // Legacy uses hardcoded ID
            };
            
            console.log(`[mimo-agent] Model state (legacy): ${currentModelId} (${availableOptions.length} available)`);
          }
          
          // Extract mode state from legacy 'modes' field
          if (sessionResponse.modes) {
            const modes = sessionResponse.modes;
            const availableOptions = Array.isArray(modes.availableModes)
              ? modes.availableModes.map((m: any) => ({
                  value: m.id,
                  name: m.name || m.id,
                  description: m.description,
                }))
              : [];
            
            const currentModeId = modes.currentModeId || (availableOptions[0]?.value ?? "");
            
            session.modeState = {
              currentModeId,
              availableModes: availableOptions,
              optionId: "mode",  // Legacy uses hardcoded ID
            };
            
            console.log(`[mimo-agent] Mode state (legacy): ${currentModeId} (${availableOptions.length} available)`);
          }
        } else {
          console.log(`[mimo-agent] No configOptions or legacy fields found`);
        }
        
        // Always send session initialized message (even if no configOptions)
        this.send({
          type: "session_initialized",
          sessionId: session.sessionId,
          modelState: session.modelState,
          modeState: session.modeState,
          timestamp: new Date().toISOString(),
        });
        console.log(`[mimo-agent] Sent session_initialized for ${session.sessionId}`);
      })
      .catch((err) => {
        console.error(`[mimo-agent] ACP init error for ${session.sessionId}:`, err);
      });

    process.stderr?.on("data", (data: Buffer) => {
      console.error(`[mimo-agent] ACP stderr (${session.sessionId}):`, data.toString());
    });

    process.on("close", (code: number | null) => {
      console.log(`[mimo-agent] ACP process exited for ${session.sessionId} with code ${code}`);
      session.acpProcess = null;
      session.acpConnection = undefined;
      session.acpSessionId = undefined;
    });

    process.on("error", (err: Error) => {
      console.error(`[mimo-agent] ACP process error for ${session.sessionId}:`, err.message);
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

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`[mimo-agent] Unknown session ${sessionId}`);
      return;
    }

    console.log(`[mimo-agent] Received acp_request for session ${sessionId}`);
    this.spawnAcpProcess(session);
  }

  private handleCancelRequest(message: any): void {
    const sessionId = message.sessionId;
    if (!sessionId) {
      console.log("[mimo-agent] No sessionId in cancel_request");
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`[mimo-agent] Unknown session ${sessionId}`);
      return;
    }

    if (session.acpProcess) {
      console.log(`[mimo-agent] Cancelling ACP request for ${sessionId}...`);
      session.acpProcess.kill("SIGTERM");
      session.acpProcess = null;
      
      this.send({
        type: "acp_cancelled",
        sessionId,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log(`[mimo-agent] No active ACP request for ${sessionId}`);
    }
  }

  private handleFileSyncRequest(message: any): void {
    const sessionId = message.sessionId;
    console.log(`[mimo-agent] File sync request received for session ${sessionId || "unknown"}`);
  }

  private handleUserMessage(message: any): void {
    const sessionId = message.sessionId;
    const content = message.content;

    if (!sessionId) {
      console.log("[mimo-agent] No sessionId in user_message");
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`[mimo-agent] Unknown session ${sessionId}`);
      this.send({
        type: "error_response",
        sessionId,
        error: `Unknown session: ${sessionId}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Send prompt via ACP connection
    if (session.acpConnection && session.acpSessionId) {
      console.log(`[mimo-agent] Sending prompt to ACP for session ${sessionId}`);
      session.acpConnection
        .prompt({
          sessionId: session.acpSessionId,
          prompt: [
            { type: "text", text: content },
          ],
        })
        .then((response) => {
          console.log(`[mimo-agent] Prompt completed: ${response.stopReason}`);
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
    } else {
      console.log(`[mimo-agent] No ACP connection for session ${sessionId}`);
    }
  }

  private async handleSetModel(message: any): Promise<void> {
    const { sessionId, modelId } = message;
    console.log(`[mimo-agent] Set model request for session ${sessionId}: ${modelId}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`[mimo-agent] Unknown session ${sessionId}`);
      return;
    }

    if (!session.acpConnection || !session.acpSessionId) {
      console.log(`[mimo-agent] No ACP connection for session ${sessionId}`);
      return;
    }

    if (!session.modelState) {
      console.log(`[mimo-agent] No model state for session ${sessionId}`);
      return;
    }

    try {
      // Try using the SDK method first
      if (session.acpConnection.setSessionConfigOption) {
        try {
          await session.acpConnection.setSessionConfigOption({
            sessionId: session.acpSessionId,
            configId: session.modelState.optionId,
            value: modelId,
          });
        } catch (err: any) {
          // If method not found, fall back to extMethod
          if (err.code === -32601 || err.message?.includes("Method not found")) {
            console.log(`[mimo-agent] setSessionConfigOption not supported, trying extMethod session/set_model`);
            await session.acpConnection.extMethod("session/set_model", {
              sessionId: session.acpSessionId,
              modelId: modelId,
            });
          } else {
            throw err;
          }
        }
      } else {
        // Fallback: use extMethod for legacy session/set_model
        await session.acpConnection.extMethod("session/set_model", {
          sessionId: session.acpSessionId,
          modelId: modelId,
        });
      }

      // Update local state
      session.modelState.currentModelId = modelId;

      // Notify platform of the change
      this.send({
        type: "model_state",
        sessionId,
        modelState: session.modelState,
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
    console.log(`[mimo-agent] Set mode request for session ${sessionId}: ${modeId}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`[mimo-agent] Unknown session ${sessionId}`);
      return;
    }

    if (!session.acpConnection || !session.acpSessionId) {
      console.log(`[mimo-agent] No ACP connection for session ${sessionId}`);
      return;
    }

    if (!session.modeState) {
      console.log(`[mimo-agent] No mode state for session ${sessionId}`);
      return;
    }

    try {
      // Try using the SDK method first
      if (session.acpConnection.setSessionConfigOption) {
        try {
          await session.acpConnection.setSessionConfigOption({
            sessionId: session.acpSessionId,
            configId: session.modeState.optionId,
            value: modeId,
          });
        } catch (err: any) {
          // If method not found, fall back to extMethod
          if (err.code === -32601 || err.message?.includes("Method not found")) {
            console.log(`[mimo-agent] setSessionConfigOption not supported, trying extMethod session/set_mode`);
            await session.acpConnection.extMethod("session/set_mode", {
              sessionId: session.acpSessionId,
              modeId: modeId,  // ← was "mode", should be "modeId"
            });
          } else {
            throw err;
          }
        }
      } else {
        // Fallback: use extMethod for legacy session/set_mode
        await session.acpConnection.extMethod("session/set_mode", {
          sessionId: session.acpSessionId,
          modeId: modeId,  // ← was "mode", should be "modeId"
        });
      }

      // Update local state
      session.modeState.currentModeId = modeId;

      // Notify platform of the change
      this.send({
        type: "mode_state",
        sessionId,
        modeState: session.modeState,
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
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      console.log(`[mimo-agent] Unknown session ${sessionId} in request_state`);
      return;
    }
    
    // Send current state to platform
    this.send({
      type: "session_initialized",
      sessionId,
      modelState: session.modelState,
      modeState: session.modeState,
      timestamp: new Date().toISOString(),
    });
    
    console.log(`[mimo-agent] Sent state for session ${sessionId}`);
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`[mimo-agent] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect().catch((error) => {
          console.error("[mimo-agent] Reconnect failed:", error.message);
        });
      }, delay);
    } else {
      console.error("[mimo-agent] Max reconnect attempts reached, exiting");
      process.exit(1);
    }
  }

  private send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.log("[mimo-agent] WebSocket not connected, message buffered");
    }
  }

  private setupShutdownHandlers(): void {
    const shutdown = () => {
      console.log("[mimo-agent] Shutting down gracefully...");
      
      // Kill all ACP processes
      for (const [sessionId, session] of this.sessions) {
        if (session.acpProcess) {
          console.log(`[mimo-agent] Killing ACP process for ${sessionId}`);
          session.acpProcess.kill("SIGTERM");
        }
        if (session.fileWatcher) {
          session.fileWatcher.close();
        }
      }

      // Close WebSocket
      if (this.ws) {
        this.ws.close();
      }

      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    process.on("SIGUSR2", shutdown);

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      console.error("[mimo-agent] Uncaught exception:", error);
      shutdown();
    });

    process.on("unhandledRejection", (reason) => {
      console.error("[mimo-agent] Unhandled rejection:", reason);
    });
  }
}

// Start the agent
const agent = new MimoAgent();
agent.start().catch((error) => {
  console.error("[mimo-agent] Failed to start:", error.message);
  process.exit(1);
});