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
 * Matches ACP SDK McpServer type exactly
 */
export type McpServerConfig =
  | {
      // Stdio transport - no type field
      name: string;
      command: string;
      args: string[];
      env?: Array<{ name: string; value: string }>;
    }
  | {
      // HTTP transport
      type: "http";
      name: string;
      url: string;
      headers?: Array<{ name: string; value: string }>;
    }
  | {
      // SSE transport
      type: "sse";
      name: string;
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
  currentThoughtBuffer?: string;
  modelState?: ModelState;
  modeState?: ModeState;
  mcpServers?: McpServerConfig[];
  agentSubpath?: string;
}

export interface FileChange {
  path: string;
  isNew?: boolean;
  deleted?: boolean;
}
