import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { AgentRepository } from "../agents/repository.js";
import { SessionRepository } from "../sessions/repository.js";
import { AgentService } from "../agents/service.js";
import { JwtService } from "../auth/jwt.js";
import { UserRepository } from "../auth/user.js";
import { ProjectRepository } from "../projects/repository.js";
import { McpServerRepository } from "../mcp-servers/repository.js";

export interface MimoEnv {
  PORT: number;
  PLATFORM_URL: string;
  JWT_SECRET: string;
  MIMO_HOME: string;
  FOSSIL_REPOS_DIR: string;
  MIMO_SHARED_FOSSIL_SERVER_PORT: number | undefined;
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
    projects: ProjectRepository;
    agents: AgentRepository;
    mcpServers: McpServerRepository;
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
  const port = overrides.env?.PORT ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
  const env: MimoEnv = {
    PORT: port,
    PLATFORM_URL:
      overrides.env?.PLATFORM_URL ??
      process.env.PLATFORM_URL ??
      `http://localhost:${port}`,
    JWT_SECRET:
      overrides.env?.JWT_SECRET ??
      process.env.JWT_SECRET ??
      "your-secret-key-change-in-production",
    MIMO_HOME: mimoHome,
    FOSSIL_REPOS_DIR:
      overrides.env?.FOSSIL_REPOS_DIR ??
      process.env.FOSSIL_REPOS_DIR ??
      join(mimoHome, "session-fossils"),
    MIMO_SHARED_FOSSIL_SERVER_PORT:
      overrides.env?.MIMO_SHARED_FOSSIL_SERVER_PORT ??
      (process.env.MIMO_SHARED_FOSSIL_SERVER_PORT
        ? parseInt(process.env.MIMO_SHARED_FOSSIL_SERVER_PORT, 10)
        : undefined),
  };

  process.env.MIMO_HOME = env.MIMO_HOME;

  const paths = resolvePaths(env.MIMO_HOME);
  ensurePaths(paths);

  const repos: MimoContext["repos"] = {
    users:
      overrides.repos?.users ??
      new UserRepository({
        usersPath: paths.users,
      }),
    projects:
      overrides.repos?.projects ??
      new ProjectRepository({
        projectsPath: paths.projects,
      }),
    agents:
      overrides.repos?.agents ??
      new AgentRepository({
        agentsPath: paths.agents,
      }),
    mcpServers:
      overrides.repos?.mcpServers ??
      new McpServerRepository({
        mcpServersPath: paths.mcpServers,
      }),
    sessions:
      overrides.repos?.sessions ??
      new SessionRepository({
        paths: {
          projects: paths.projects,
          data: paths.data,
        },
        fossilReposDir: env.FOSSIL_REPOS_DIR,
      }),
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
