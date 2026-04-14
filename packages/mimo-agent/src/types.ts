import { ChildProcess } from "child_process";
import { watch } from "fs";

export interface AgentConfig {
  token: string;
  platform: string;
  workDir: string;
  provider: "opencode" | "claude";
}

export interface ModelState {
  currentModelId: string;
  availableModels: Array<{ value: string; name: string; description?: string }>;
  optionId: string;
}

export interface ModeState {
  currentModeId: string;
  availableModes: Array<{ value: string; name: string; description?: string }>;
  optionId: string;
}

/**
 * MCP server configuration passed to ACP newSession
 * Supports both stdio and HTTP/SSE transports
 */
export type McpServerConfig =
  | {
      name: string;
      transport: "stdio";
      command: string;
      args: string[];
      env?: Array<{ name: string; value: string }>;
    }
  | {
      name: string;
      transport: "http" | "sse";
      url: string;
      headers?: Array<{ name: string; value: string }>;
    };

export interface SessionInfo {
  sessionId: string;
  checkoutPath: string;
  fossilUrl: string;
  fossilUser?: string;
  fossilPassword?: string;
  agentWorkspaceUser?: string;
  agentWorkspacePassword?: string;
  acpProcess: ChildProcess | null;
  fileWatcher: ReturnType<typeof watch> | null;
  acpSessionId?: string;
  currentThoughtBuffer?: string;
  modelState?: ModelState;
  modeState?: ModeState;
  localDevMirrorPath?: string;
  mcpServers?: McpServerConfig[];
}

export interface FileChange {
  path: string;
  isNew?: boolean;
  deleted?: boolean;
}
