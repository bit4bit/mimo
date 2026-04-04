import { ChildProcess } from "child_process";
import { watch } from "fs";

export interface AgentConfig {
  token: string;
  platform: string;
  workDir: string;
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

export interface SessionInfo {
  sessionId: string;
  checkoutPath: string;
  fossilUrl: string;
  agentWorkspaceUser?: string;
  agentWorkspacePassword?: string;
  acpProcess: ChildProcess | null;
  fileWatcher: ReturnType<typeof watch> | null;
  acpSessionId?: string;
  currentThoughtBuffer?: string;
  modelState?: ModelState;
  modeState?: ModeState;
}

export interface FileChange {
  path: string;
  isNew?: boolean;
  deleted?: boolean;
}
