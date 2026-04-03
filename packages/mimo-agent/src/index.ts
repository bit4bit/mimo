import { WebSocket } from "ws";
import { spawn, ChildProcess, execSync } from "child_process";
import { watch, existsSync, mkdirSync } from "fs";
import { join } from "path";

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

    session.acpProcess = spawn(acpCommand, acpArgs, {
      cwd: session.checkoutPath,
      stdio: ["pipe", "pipe", "pipe"],
    });

    session.acpProcess.stdout?.on("data", (data: Buffer) => {
      this.send({
        type: "acp_response",
        sessionId: session.sessionId,
        content: data.toString(),
        timestamp: new Date().toISOString(),
      });
    });

    session.acpProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`[mimo-agent] ACP stderr (${session.sessionId}):`, data.toString());
    });

    session.acpProcess.on("close", (code: number | null) => {
      console.log(`[mimo-agent] ACP process exited for ${session.sessionId} with code ${code}`);
      session.acpProcess = null;
    });

    session.acpProcess.on("error", (err: Error) => {
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

    // Forward to ACP process if running
    if (session.acpProcess && session.acpProcess.stdin) {
      session.acpProcess.stdin.write(content + "\n");
    } else {
      console.log(`[mimo-agent] No ACP process for session ${sessionId}`);
    }
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