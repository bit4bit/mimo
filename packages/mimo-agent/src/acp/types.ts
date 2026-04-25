import { ModelState, ModeState } from "../types";

export interface AcpProcessHandle {
  kill(signal?: string): void;
  killed?: boolean;
  stderr?: { on(event: "data", cb: (data: Buffer) => void): void };
  on(event: "close", cb: (code: number | null) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
}

export interface ConfigOption {
  id: string;
  category: string;
  type: "select" | "text" | "number";
  options?: Array<{
    value: string;
    name: string;
    description?: string;
  }>;
  currentValue?: string;
}

export interface LegacyModels {
  currentModelId?: string;
  availableModels?: Array<{
    modelId?: string;
    id?: string;
    name?: string;
    description?: string;
  }>;
}

export interface LegacyModes {
  currentModeId?: string;
  availableModes?: Array<{
    id: string;
    name?: string;
    description?: string;
  }>;
}

export interface NewSessionResponse {
  sessionId: string;
  configOptions?: ConfigOption[];
  models?: LegacyModels;
  modes?: LegacyModes;
}

export interface IAcpProvider {
  /**
   * The provider name (e.g., "opencode", "claude-code")
   */
  readonly name: string;

  /**
   * Spawn the ACP process or start an in-process agent
   */
  spawn(cwd: string): {
    process: AcpProcessHandle;
    input: WritableStream<Uint8Array>;
    output: ReadableStream<Uint8Array>;
  };

  /**
   * Extract model/mode state from session response
   */
  extractState(response: NewSessionResponse): {
    modelState?: ModelState;
    modeState?: ModeState;
  };

  /**
   * Set the model for a session
   */
  setModel(
    connection: any,
    acpSessionId: string,
    modelId: string,
    optionId: string,
  ): Promise<void>;

  /**
   * Set the mode for a session
   */
  setMode(
    connection: any,
    acpSessionId: string,
    modeId: string,
    optionId: string,
  ): Promise<void>;

  /**
   * Map update types to Mimo message types
   */
  mapUpdateType(updateType: string): string | null;
}
