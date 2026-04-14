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
import { CredentialRepository } from "../credentials/repository.js";
import { ImpactRepository } from "../impact/repository.js";
import { ChatService } from "../sessions/chat.js";
import { FrameStateService } from "../sessions/frame-state.js";
import { SccService } from "../impact/scc-service.js";
import { CommitService } from "../commits/service.js";
import { FileSyncService } from "../sync/service.js";
import { AutoCommitService } from "../auto-commit/service.js";
import { McpServerService } from "../mcp-servers/service.js";
import { ConfigService } from "../config/service.js";
import { ImpactCalculator } from "../impact/calculator.js";
import { vcs } from "../vcs/index.js";

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
    credentials: CredentialRepository;
    impacts: ImpactRepository;
  };
  services: {
    auth: JwtService;
    agents: AgentService;
    chat: ChatService;
    frameState: FrameStateService;
    scc: SccService;
    commits: CommitService;
    fileSync: FileSyncService;
    autoCommit: AutoCommitService;
    mcpServer: McpServerService;
    config: ConfigService;
    impactCalculator: ImpactCalculator;
  };
}

type CreateMimoContextOverrides = {
  env?: Partial<MimoEnv>;
  repos?: Partial<MimoContext["repos"]>;
  services?: Partial<MimoContext["services"]>;
};

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
  const mimoHome = overrides.env?.MIMO_HOME ?? join(homedir(), ".mimo");
  const port = overrides.env?.PORT ?? 3000;
  const env: MimoEnv = {
    PORT: port,
    PLATFORM_URL: overrides.env?.PLATFORM_URL ?? `http://localhost:${port}`,
    JWT_SECRET: overrides.env?.JWT_SECRET ?? "your-secret-key-change-in-production",
    MIMO_HOME: mimoHome,
    FOSSIL_REPOS_DIR: overrides.env?.FOSSIL_REPOS_DIR ?? join(mimoHome, "session-fossils"),
    MIMO_SHARED_FOSSIL_SERVER_PORT: overrides.env?.MIMO_SHARED_FOSSIL_SERVER_PORT,
  };

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
    credentials:
      overrides.repos?.credentials ??
      new CredentialRepository({ usersPath: paths.users }),
    impacts:
      overrides.repos?.impacts ??
      new ImpactRepository({ projectsPath: paths.projects }),
  };

  // Create shared scc service instance to be passed to ImpactCalculator
  const sccService = overrides.services?.scc ?? new SccService(join(paths.root, "bin", "scc"), join(paths.root, "cache"));

  // Create shared impactCalculator instance with injected sccService
  const impactCalculator = overrides.services?.impactCalculator ?? new ImpactCalculator(sccService);

  const services: MimoContext["services"] = {
    auth: overrides.services?.auth ?? new JwtService(env.JWT_SECRET),
    agents:
      overrides.services?.agents ??
      new AgentService(repos.agents, env.JWT_SECRET),
    chat:
      overrides.services?.chat ??
      new ChatService(paths),
    frameState:
      overrides.services?.frameState ??
      new FrameStateService(paths),
    scc: sccService,
    commits:
      overrides.services?.commits ??
      new CommitService({
        sessionRepository: repos.sessions,
        projectRepository: repos.projects,
        impactRepository: repos.impacts,
        impactCalculator,
        vcs,
      }),
    fileSync:
      overrides.services?.fileSync ??
      new FileSyncService({
        sessionRepository: repos.sessions,
        sccService,
      }),
    autoCommit:
      overrides.services?.autoCommit ??
      new AutoCommitService({
        commitService: overrides.services?.commits ??
          new CommitService({
            sessionRepository: repos.sessions,
            projectRepository: repos.projects,
            impactRepository: repos.impacts,
            impactCalculator,
            vcs,
          }),
        sessionRepository: repos.sessions,
        impactCalculator,
      }),
    mcpServer:
      overrides.services?.mcpServer ??
      new McpServerService(repos.mcpServers),
    config:
      overrides.services?.config ??
      new ConfigService(paths.config),
    impactCalculator,
  };

  return {
    env,
    paths,
    repos,
    services,
  };
}
