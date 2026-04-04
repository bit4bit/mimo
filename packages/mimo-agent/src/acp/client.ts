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
}

export interface AcpClientSession {
  sessionId: string;
  acpSessionId: string;
  connection: acp.ClientSideConnection;
  modelState?: ModelState;
  modeState?: ModeState;
  currentThoughtBuffer?: string;
}

export class AcpClient {
  private provider: IAcpProvider;
  private sessionId: string;
  private callbacks: AcpClientCallbacks;
  private session: AcpClientSession | null = null;

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
    output: ReadableStream<Uint8Array>
  ): Promise<NewSessionResponse> {
    const stream = acp.ndJsonStream(input, output);

    // Create client with update handlers
    const client: acp.Client = {
      requestPermission: async () => ({
        outcome: { outcome: "approved", options: ["allow"] },
      }),
      sessionUpdate: async (params) => {
        this.handleSessionUpdate(params.update as any);
      },
    };

    const connection = new acp.ClientSideConnection(() => client, stream);

    // Initialize connection
    const initResponse = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: { name: "mimo-agent", version: "0.1.0" },
    });

    console.log(`[mimo-agent] ACP initialized: ${initResponse.protocolVersion}`);

    // Create session
    const sessionResponse = await connection.newSession({
      cwd,
      mcpServers: [],
    });

    // Extract state using provider
    const state = this.provider.extractState(
      sessionResponse as NewSessionResponse
    );

    // Store session info
    this.session = {
      sessionId: this.sessionId,
      acpSessionId: sessionResponse.sessionId,
      connection,
      modelState: state.modelState,
      modeState: state.modeState,
    };

    return sessionResponse as NewSessionResponse;
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

    return this.session.connection.prompt({
      sessionId: this.session.acpSessionId,
      prompt: [{ type: "text", text: content }],
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
