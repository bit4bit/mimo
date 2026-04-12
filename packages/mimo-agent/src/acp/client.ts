import * as acp from "@agentclientprotocol/sdk";
import { IAcpProvider, NewSessionResponse } from "./types";
import { ModelState, ModeState } from "../types";

export interface AcpClientCallbacks {
  onThoughtStart: (sessionId: string) => void;
  onThoughtChunk: (sessionId: string, content: string) => void;
  onThoughtEnd: (sessionId: string) => void;
  onMessageChunk: (sessionId: string, content: string) => void;
  onUsageUpdate: (sessionId: string, usage: any) => void;
  onGenericUpdate: (sessionId: string, content: string) => void;
  onPermissionRequest: (sessionId: string, requestId: string, params: acp.RequestPermissionRequest) => Promise<acp.RequestPermissionResponse>;
}

export interface AcpClientSession {
  sessionId: string;
  acpSessionId: string;
  connection: acp.ClientSideConnection;
  modelState?: ModelState;
  modeState?: ModeState;
  currentThoughtBuffer?: string;
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
    callbacks: AcpClientCallbacks
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
    existingSessionId?: string
  ): Promise<InitializeResult> {
    const stream = acp.ndJsonStream(input, output);

    const client: acp.Client = {
      requestPermission: async (params) => {
        const requestId = crypto.randomUUID();
        return this.callbacks.onPermissionRequest(this.sessionId, requestId, params);
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

    console.log(`[mimo-agent] ACP initialized: ${initResponse.protocolVersion}`);

    this.capabilities = {
      loadSession: initResponse.agentCapabilities?.loadSession ?? false,
    };
    console.log(`[mimo-agent] Agent capabilities:`, this.capabilities);

    let sessionResponse: acp.NewSessionResponse;
    let wasReset = false;
    let resetReason: string | undefined;

    if (existingSessionId && this.capabilities.loadSession) {
      try {
        console.log(`[mimo-agent] Attempting to load existing session: ${existingSessionId}`);
        sessionResponse = await connection.loadSession({
          sessionId: existingSessionId,
          cwd,
          mcpServers: [],
        });
        console.log(`[mimo-agent] Session loaded successfully: ${sessionResponse.sessionId}`);
      } catch (error) {
        // ACP errors are plain objects { code, message, data }, not Error instances
        const errorMsg = error instanceof Error
          ? error.message
          : (error as any)?.message ?? String(error);
        console.log(`[mimo-agent] Failed to load session, creating new session:`, error);
        wasReset = true;
        resetReason = `loadSession failed: ${errorMsg}`;
        sessionResponse = await connection.newSession({
          cwd,
          mcpServers: [],
        });
      }
    } else {
      if (existingSessionId && !this.capabilities.loadSession) {
        wasReset = true;
        resetReason = "loadSession not supported";
      }
      sessionResponse = await connection.newSession({
        cwd,
        mcpServers: [],
      });
    }

    const state = this.provider.extractState(
      sessionResponse as NewSessionResponse
    );

    this.session = {
      sessionId: this.sessionId,
      acpSessionId: sessionResponse.sessionId,
      connection,
      modelState: state.modelState,
      modeState: state.modeState,
    };

    return {
      acpSessionId: sessionResponse.sessionId,
      wasReset,
      resetReason,
    };
  }

  async loadSession(
    cwd: string,
    input: WritableStream<Uint8Array>,
    output: ReadableStream<Uint8Array>,
    sessionId: string
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
          update.content?.text || ""
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
          update.content?.text || ""
        );
        break;

      case "usage_update":
        this.callbacks.onUsageUpdate(this.sessionId, {
          cost: update.cost || {},
          size: update.size,
          used: update.used,
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

    try {
      const response = await this.session.connection.prompt({
        sessionId: this.session.acpSessionId,
        prompt: [{ type: "text", text: content }],
      });
      
      // Signal that the agent has completed processing (Codex doesn't send thoughts)
      this.callbacks.onThoughtEnd(this.sessionId);
      this.session.currentThoughtBuffer = "";
      
      return response;
    } catch (error) {
      // Also signal completion on error
      this.callbacks.onThoughtEnd(this.sessionId);
      this.session.currentThoughtBuffer = "";
      throw error;
    }
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
      this.session.modelState.optionId
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
      this.session.modeState.optionId
    );

    // Update local state
    this.session.modeState.currentModeId = modeId;
  }
}
