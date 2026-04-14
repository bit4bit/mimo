import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { AgentRepository } from "../agents/repository.js";
import { SessionRepository } from "../sessions/repository.js";
import { AgentService } from "../agents/service.js";
import { JwtService } from "../auth/jwt.js";
import { UserRepository } from "../auth/user.js";

export interface MimoEnv {
  PORT: number;
  PLATFORM_URL: string;
  JWT_SECRET: string;
  MIMO_HOME: string;
}

export interface MimoPaths {
  root: string;
  data: string;
  users: string;
  projects: string;
  agents: string;
  mcpServers: string;
  config: string;
}

export interface MimoContext {
  env: MimoEnv;
  paths: MimoPaths;
  repos: {
    users: UserRepository;
    agents: AgentRepository;
    sessions: SessionRepository;
  };
  services: {
    auth: JwtService;
    agents: AgentService;
  };
}

type CreateMimoContextOverrides = {
  env?: Partial<MimoEnv>;
  repos?: Partial<MimoContext["repos"]>;
  services?: Partial<MimoContext["services"]>;
};

function resolveMimoHome(override?: string): string {
  return override || process.env.MIMO_HOME || join(homedir(), ".mimo");
}

function resolvePaths(mimoHome: string): MimoPaths {
  return {
    root: mimoHome,
    data: mimoHome,
    users: join(mimoHome, "users"),
    projects: join(mimoHome, "projects"),
    agents: join(mimoHome, "agents"),
    mcpServers: join(mimoHome, "mcp-servers"),
    config: join(mimoHome, "config.yaml"),
  };
}

function ensurePaths(paths: MimoPaths): void {
  mkdirSync(paths.root, { recursive: true });
  mkdirSync(paths.users, { recursive: true });
  mkdirSync(paths.projects, { recursive: true });
  mkdirSync(paths.agents, { recursive: true });
  mkdirSync(paths.mcpServers, { recursive: true });
}

export function createMimoContext(overrides: CreateMimoContextOverrides = {}): MimoContext {
  const mimoHome = resolveMimoHome(overrides.env?.MIMO_HOME);
  const env: MimoEnv = {
    PORT: overrides.env?.PORT ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000),
    PLATFORM_URL:
      overrides.env?.PLATFORM_URL ??
      process.env.PLATFORM_URL ??
      `http://localhost:${overrides.env?.PORT ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000)}`,
    JWT_SECRET:
      overrides.env?.JWT_SECRET ??
      process.env.JWT_SECRET ??
      "your-secret-key-change-in-production",
    MIMO_HOME: mimoHome,
  };

  process.env.MIMO_HOME = env.MIMO_HOME;

  const paths = resolvePaths(env.MIMO_HOME);
  ensurePaths(paths);

  const repos: MimoContext["repos"] = {
    users: overrides.repos?.users ?? new UserRepository(),
    agents: overrides.repos?.agents ?? new AgentRepository(),
    sessions: overrides.repos?.sessions ?? new SessionRepository(),
  };

  const services: MimoContext["services"] = {
    auth: overrides.services?.auth ?? new JwtService(env.JWT_SECRET),
    agents:
      overrides.services?.agents ??
      new AgentService(repos.agents, env.JWT_SECRET),
  };

  return {
    env,
    paths,
    repos,
    services,
  };
}
