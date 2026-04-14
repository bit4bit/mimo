import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

function getMimoHome(): string {
  return process.env.MIMO_HOME || join(homedir(), ".mimo");
}

export function getPaths() {
  const MIMO_HOME = getMimoHome();
  return {
    root: MIMO_HOME,
    users: join(MIMO_HOME, "users"),
    projects: join(MIMO_HOME, "projects"),
    agents: join(MIMO_HOME, "agents"),
    mcpServers: join(MIMO_HOME, "mcp-servers"),
    config: join(MIMO_HOME, "config.yaml"),
  } as const;
}

export const MIMO_HOME = getMimoHome();

export const Paths = {
  root: MIMO_HOME,
  users: join(MIMO_HOME, "users"),
  projects: join(MIMO_HOME, "projects"),
  agents: join(MIMO_HOME, "agents"),
  config: join(MIMO_HOME, "config.yaml"),
} as const;

export function ensureMimoHome(): void {
  const paths = getPaths();
  if (!existsSync(paths.root)) {
    mkdirSync(paths.root, { recursive: true });
  }
  if (!existsSync(paths.users)) {
    mkdirSync(paths.users, { recursive: true });
  }
  if (!existsSync(paths.projects)) {
    mkdirSync(paths.projects, { recursive: true });
  }
  if (!existsSync(paths.agents)) {
    mkdirSync(paths.agents, { recursive: true });
  }
}

export function getUserPath(username: string): string {
  return join(getPaths().users, username);
}

export function getProjectPath(projectId: string): string {
  return join(getPaths().projects, projectId);
}

export function getSessionPath(projectId: string, sessionId: string): string {
  return join(getPaths().projects, projectId, "sessions", sessionId);
}

export function getAgentPath(agentId: string): string {
  return join(getPaths().agents, agentId);
}

export function getUserCredentialsPath(): string {
  return join(getPaths().users, "credentials.yaml");
}

export function getCredentialsPath(username: string): string {
  return join(getPaths().users, username, "credentials");
}
