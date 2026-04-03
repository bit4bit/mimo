import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

export const MIMO_HOME = process.env.MIMO_HOME || join(homedir(), ".mimo");

export const Paths = {
  root: MIMO_HOME,
  users: join(MIMO_HOME, "users"),
  projects: join(MIMO_HOME, "projects"),
  agents: join(MIMO_HOME, "agents"),
  config: join(MIMO_HOME, "config.yaml"),
} as const;

export function ensureMimoHome(): void {
  if (!existsSync(Paths.root)) {
    mkdirSync(Paths.root, { recursive: true });
  }
  if (!existsSync(Paths.users)) {
    mkdirSync(Paths.users, { recursive: true });
  }
  if (!existsSync(Paths.projects)) {
    mkdirSync(Paths.projects, { recursive: true });
  }
  if (!existsSync(Paths.agents)) {
    mkdirSync(Paths.agents, { recursive: true });
  }
}

export function getUserPath(username: string): string {
  return join(Paths.users, username);
}

export function getProjectPath(projectId: string): string {
  return join(Paths.projects, projectId);
}

export function getSessionPath(projectId: string, sessionId: string): string {
  return join(Paths.projects, projectId, "sessions", sessionId);
}

export function getAgentPath(agentId: string): string {
  return join(Paths.agents, agentId);
}
