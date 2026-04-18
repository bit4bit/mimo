import { ModelState, ModeState, McpServerConfig } from "../types";
import { logger } from "../logger.js";
import * as acp from "@agentclientprotocol/sdk";
export interface AcpClientCallbacks {
  onThoughtStart: (sessionId: string) => void;
  onThoughtChunk: (sessionId: string, content: string) => void;
  onThoughtEnd: (sessionId: string) => void;
  onMessageChunk: (sessionId: string, content: string) => void;
  onUsageUpdate: (sessionId: string, usage: any) => void;
  onGenericUpdate: (sessionId: string, content: string) => void;
  onToolCall: (
    sessionId: string,
    tool: {
      toolCallId: string;
      title: string;
      kind?: string;
      rawInput?: unknown;
      status: string;
    },
  ) => void;
  onToolCallUpdate: (
    sessionId: string,
    update: {
      toolCallId: string;
      status?: string;
      rawOutput?: unknown;
      content?: unknown[];
    },
  ) => void;
  onPermissionRequest: (
    sessionId: string,
    requestId: string,
    params: acp.RequestPermissionRequest,
  ) => Promise<acp.RequestPermissionResponse>;
}

export interface AcpClientSession {
  sessionId: string;
  acpSessionId: string;
  connection: acp.ClientSideConnection;
  stdin: WritableStream<Uint8Array>;
  modelState?: ModelState;
  modeState?: ModeState;
  currentThoughtBuffer?: string;
  checkoutPath?: string;
  mcpServers?: McpServerConfig[];
}

export interface InitializeResult {
  acpSessionId: string;
  wasReset: boolean;
  resetReason?: string;
}

export class AcpClient {
  private provider: IAcpProvider;
  private sessionId: string;
  private callbacks: AcpClientCallbacks;
  private session: AcpClientSession | null = null;
  private capabilities: { loadSession?: boolean } = {};

  constructor(
    provider: IAcpProvider,
    sessionId: string,
    callbacks: AcpClientCallbacks,
  ) {
    this.provider = provider;
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  get acpSessionId(): string | undefined {
    return this.session?.acpSessionId;
  }

  get modelState(): ModelState | undefined {
    return this.session?.modelState;
  }

  get modeState(): ModeState | undefined {
    return this.session?.modeState;
  }

  async initialize(
    cwd: string,
    input: WritableStream<Uint8Array>,
    output: ReadableStream<Uint8Array>,
    existingSessionId?: string,
    mcpServers?: McpServerConfig[],
  ): Promise<InitializeResult> {
    const stream = acp.ndJsonStream(input, output);

    const client: acp.Client = {
      requestPermission: async (params) => {
        const requestId = crypto.randomUUID();
        return this.callbacks.onPermissionRequest(
          this.sessionId,
          requestId,
          params,
        );
      },
      sessionUpdate: async (params) => {
        this.handleSessionUpdate(params.update as any);
      },
    };

    const connection = new acp.ClientSideConnection(() => client, stream);

    const initResponse = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: { name: "mimo-agent", version: "0.1.0" },
    });

    logger.debug(
      `[mimo-agent] ACP initialized: ${initResponse.protocolVersion}`,
    );

    this.capabilities = {
      loadSession: initResponse.agentCapabilities?.loadSession ?? false,
    };
    logger.debug(`[mimo-agent] Agent capabilities:`, this.capabilities);

    let sessionResponse: acp.NewSessionResponse;
    let wasReset = false;
    let resetReason: string | undefined;

    if (existingSessionId && this.capabilities.loadSession) {
      try {
        logger.debug(
          `[mimo-agent] Attempting to load existing session: ${existingSessionId}`,
        );
        const loadResponse = await connection.loadSession({
          sessionId: existingSessionId,
          cwd,
          mcpServers: (mcpServers as any) || [],
        });
        sessionResponse = loadResponse as acp.NewSessionResponse;
        logger.debug(
          `[mimo-agent] Session loaded successfully: ${sessionResponse.sessionId}`,
        );
      } catch (error) {
        // ACP errors are plain objects { code, message, data }, not Error instances
        const errorMsg =
          error instanceof Error
            ? error.message
            : ((error as any)?.message ?? String(error));
        logger.debug(
          `[mimo-agent] Failed to load session, creating new session:`,
          error,
        );
        wasReset = true;
        resetReason = `loadSession failed: ${errorMsg}`;
        sessionResponse = await connection.newSession({
          cwd,
          mcpServers: (mcpServers as any) || [],
        });
      }
    } else {
      if (existingSessionId && !this.capabilities.loadSession) {
        wasReset = true;
        resetReason = "loadSession not supported";
      }
      sessionResponse = await connection.newSession({
        cwd,
        mcpServers: (mcpServers as any) || [],
      });
    }

    const state = this.provider.extractState(
      sessionResponse as NewSessionResponse,
    );

    this.session = {
      sessionId: this.sessionId,
      acpSessionId: sessionResponse.sessionId,
      connection,
      stdin: input,
      modelState: state.modelState,
      modeState: state.modeState,
      checkoutPath: cwd,
      mcpServers,
    };

    return {
      acpSessionId: sessionResponse.sessionId,
      wasReset,
      resetReason,
    };
  }

  /**
   * Gracefully close the ACP connection.
   *
   * Closes stdin (EOF) to signal the agent to shut down, then waits for
   * the connection to close (i.e. the process exits and stdout closes).
   * If the agent does not exit within `timeoutMs`, the caller is responsible
   * for sending SIGTERM/SIGKILL.
   */
  async close(timeoutMs = 5000): Promise<void> {
    if (!this.session) return;

    const { connection, stdin } = this.session;
    this.session = null;

    // Close stdin — this sends EOF to the agent process, signalling shutdown.
    try {
      const writer = stdin.getWriter();
      await writer.close();
    } catch {
      // Stream may already be closed/aborted if the process died on its own.
    }

    // Wait for the connection to observe the stream end (stdout closes when
    // the process exits). The timeout is the caller's cue to force-kill.
    await Promise.race([
      connection.closed,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  async loadSession(
    cwd: string,
    input: WritableStream<Uint8Array>,
    output: ReadableStream<Uint8Array>,
    sessionId: string,
  ): Promise<InitializeResult> {
    return this.initialize(cwd, input, output, sessionId);
  }

  private handleSessionUpdate(update: any): void {
    const updateType = update?.sessionUpdate;

    if (!this.session) return;

    const mappedType = this.provider.mapUpdateType(updateType);

    // Skip updates we don't care about
    if (mappedType === null) return;

    switch (mappedType) {
      case "thought_chunk":
        // Send thought start on first chunk
        if (!this.session.currentThoughtBuffer) {
          this.session.currentThoughtBuffer = "";
          this.callbacks.onThoughtStart(this.sessionId);
        }
        this.session.currentThoughtBuffer += update.content?.text || "";
        this.callbacks.onThoughtChunk(
          this.sessionId,
          update.content?.text || "",
        );
        break;

      case "message_chunk":
        // End thought buffering if active
        if (this.session.currentThoughtBuffer) {
          this.callbacks.onThoughtEnd(this.sessionId);
          this.session.currentThoughtBuffer = "";
        }
        this.callbacks.onMessageChunk(
          this.sessionId,
          update.content?.text || "",
        );
        break;

      case "usage_update":
        this.callbacks.onUsageUpdate(this.sessionId, {
          cost: update.cost || {},
          size: update.size,
          used: update.used,
        });
        break;

      case "tool_call":
        this.callbacks.onToolCall(this.sessionId, {
          toolCallId: update.toolCallId,
          title: update.title,
          kind: update.kind,
          rawInput: update.rawInput,
          status: update.status || "pending",
        });
        break;

      case "tool_call_update":
        this.callbacks.onToolCallUpdate(this.sessionId, {
          toolCallId: update.toolCallId,
          status: update.status,
          rawOutput: update.rawOutput,
          content: update.content,
        });
        break;

      default:
        this.callbacks.onGenericUpdate(this.sessionId, updateType || "update");
    }
  }

  async prompt(content: string): Promise<acp.PromptResponse> {
    if (!this.session) {
      throw new Error("Session not initialized");
    }

    // Reset thought buffer at start of prompt
    this.session.currentThoughtBuffer = "";

    const response = await this.session.connection.prompt({
      sessionId: this.session.acpSessionId,
      prompt: [{ type: "text", text: content }],
    });

    // Note: thought_end is sent by usage_update handler, not here.
    // Codex sends content in multiple phases (initial + after tool calls),
    // so we can't send thought_end until usage_update signals completion.

    return response;
  }

  async cancel(): Promise<void> {
    if (!this.session) {
      throw new Error("Session not initialized");
    }

    await this.session.connection.cancel({
      sessionId: this.session.acpSessionId,
    });
  }

  async setModel(modelId: string): Promise<void> {
    if (!this.session) {
      throw new Error("Session not initialized");
    }

    if (!this.session.modelState) {
      throw new Error("Model state not available");
    }

    await this.provider.setModel(
      this.session.connection,
      this.session.acpSessionId,
      modelId,
      this.session.modelState.optionId,
    );

    // Update local state
    this.session.modelState.currentModelId = modelId;
  }

  async setMode(modeId: string): Promise<void> {
    if (!this.session) {
      throw new Error("Session not initialized");
    }

    if (!this.session.modeState) {
      throw new Error("Mode state not available");
    }

    await this.provider.setMode(
      this.session.connection,
      this.session.acpSessionId,
      modeId,
      this.session.modeState.optionId,
    );

    // Update local state
    this.session.modeState.currentModeId = modeId;
  }

  async clear(): Promise<{
    acpSessionId: string;
    wasReset: boolean;
    resetReason?: string;
  }> {
    if (!this.session) {
      throw new Error("Session not initialized");
    }

    const connection = this.session.connection;
    const currentSession = this.session;

    if (!currentSession.checkoutPath) {
      throw new Error("Missing checkoutPath for clear()");
    }

    // Create new session (closing old session is not supported by most providers)
    const sessionResponse = await connection.newSession({
      cwd: currentSession.checkoutPath,
      mcpServers: (currentSession.mcpServers as any) || [],
    });

    // Extract state from new session
    const state = this.provider.extractState(
      sessionResponse as NewSessionResponse,
    );

    // Update session with new info
    this.session = {
      sessionId: currentSession.sessionId,
      acpSessionId: sessionResponse.sessionId,
      connection: currentSession.connection,
      stdin: currentSession.stdin,
      modelState: state.modelState,
      modeState: state.modeState,
      currentThoughtBuffer: undefined,
      checkoutPath: currentSession.checkoutPath,
      mcpServers: currentSession.mcpServers,
    };

    logger.debug(
      `[mimo-agent] Session cleared: old=${currentSession.acpSessionId}, new=${sessionResponse.sessionId}`,
    );

    return {
      acpSessionId: sessionResponse.sessionId,
      wasReset: true,
      resetReason: "session_cleared",
    };
  }
}
