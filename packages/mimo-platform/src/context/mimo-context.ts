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
import { JscpdService } from "../impact/jscpd-service.js";
import { CommitService } from "../commits/service.js";
import { FileSyncService } from "../sync/service.js";
import { AutoCommitService } from "../auto-commit/service.js";
import { McpServerService } from "../mcp-servers/service.js";
import { ConfigService } from "../config/service.js";
import { ImpactCalculator } from "../impact/calculator.js";
import { VCS } from "../vcs/index.js";
import { sessionStateService } from "../sessions/state.js";
import { SharedFossilServer } from "../vcs/shared-fossil-server.js";
import type { SharedFossilServerConfig } from "../vcs/shared-fossil-server.js";
import {
  createFileWatcherService,
  type FileWatcherService,
} from "../files/file-watcher-service.js";
import { ExpertService, createExpertService } from "../files/expert-service.js";
import { createFileService } from "../files/service.js";
import { createOS } from "../os/node-adapter.js";
import type { OS } from "../os/types.js";

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
    jscpd: JscpdService;
    commits: CommitService;
    fileSync: FileSyncService;
    autoCommit: AutoCommitService;
    mcpServer: McpServerService;
    config: ConfigService;
    impactCalculator: ImpactCalculator;
    vcs: VCS;
    sessionState: typeof sessionStateService;
    sharedFossil: SharedFossilServer | DummySharedFossilServer | null;
    fileWatcher: FileWatcherService;
    expert: ExpertService;
  };
}

type CreateMimoContextOverrides = {
  env?: Partial<MimoEnv>;
  repos?: Partial<MimoContext["repos"]>;
  services?: Partial<MimoContext["services"]>;
};

function resolvePaths(mimoHome: string, os: OS): MimoPaths {
  return {
    root: mimoHome,
    data: mimoHome,
    users: os.path.join(mimoHome, "users"),
    projects: os.path.join(mimoHome, "projects"),
    agents: os.path.join(mimoHome, "agents"),
    mcpServers: os.path.join(mimoHome, "mcp-servers"),
    config: os.path.join(mimoHome, "config.yaml"),
  };
}

function ensurePaths(paths: MimoPaths, os: OS): void {
  os.fs.mkdir(paths.root, { recursive: true });
  os.fs.mkdir(paths.users, { recursive: true });
  os.fs.mkdir(paths.projects, { recursive: true });
  os.fs.mkdir(paths.agents, { recursive: true });
  os.fs.mkdir(paths.mcpServers, { recursive: true });
}

/**
 * Factory function to create a SharedFossilServer with configuration from MimoEnv.
 * Port is required - throws error if not provided.
 */
export function createSharedFossilServer(env: MimoEnv, os: OS): SharedFossilServer {
  const port = env.MIMO_SHARED_FOSSIL_SERVER_PORT;
  if (port === undefined) {
    throw new Error(
      "MIMO_SHARED_FOSSIL_SERVER_PORT is required in environment",
    );
  }

  const config: SharedFossilServerConfig = {
    port,
    reposDir: env.FOSSIL_REPOS_DIR,
  };

  return new SharedFossilServer(config, os);
}

export function createMimoContext(
  overrides: CreateMimoContextOverrides = {},
): MimoContext {
  // Create OS abstraction with injected environment values
  const os: OS = createOS({
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    ...process.env,
  });

  const mimoHome = overrides.env?.MIMO_HOME ?? os.path.join(os.path.homeDir(), ".mimo");
  const port = overrides.env?.PORT ?? 3000;
  const env: MimoEnv = {
    PORT: port,
    PLATFORM_URL: overrides.env?.PLATFORM_URL ?? `http://localhost:${port}`,
    JWT_SECRET:
      overrides.env?.JWT_SECRET ?? "your-secret-key-change-in-production",
    MIMO_HOME: mimoHome,
    FOSSIL_REPOS_DIR:
      overrides.env?.FOSSIL_REPOS_DIR ?? os.path.join(mimoHome, "session-fossils"),
    MIMO_SHARED_FOSSIL_SERVER_PORT:
      overrides.env?.MIMO_SHARED_FOSSIL_SERVER_PORT,
  };

  const paths = resolvePaths(env.MIMO_HOME, os);
  ensurePaths(paths, os);

  // Create VCS with injected OS
  const vcs = overrides.services?.vcs ?? new VCS({ os });

  const repos: MimoContext["repos"] = {
    users:
      overrides.repos?.users ??
      new UserRepository({
        usersPath: paths.users,
        os,
      }),
    projects:
      overrides.repos?.projects ??
      new ProjectRepository({
        projectsPath: paths.projects,
        os,
      }),
    agents:
      overrides.repos?.agents ??
      new AgentRepository({
        agentsPath: paths.agents,
        os,
      }),
    mcpServers:
      overrides.repos?.mcpServers ??
      new McpServerRepository({
        mcpServersPath: paths.mcpServers,
        os,
      }),
    sessions:
      overrides.repos?.sessions ??
      new SessionRepository({
        paths: {
          projects: paths.projects,
          data: paths.data,
        },
        fossilReposDir: env.FOSSIL_REPOS_DIR,
        os,
      }),
    credentials:
      overrides.repos?.credentials ??
      new CredentialRepository({ usersPath: paths.users, os }),
    impacts:
      overrides.repos?.impacts ??
      new ImpactRepository({ projectsPath: paths.projects, os }),
  };

  // Create shared scc and jscpd service instances to be passed to ImpactCalculator
  const sccService =
    overrides.services?.scc ??
    new SccService(os, os.path.join(paths.root, "bin", "scc"), os.path.join(paths.root, "cache"));
  const jscpdService = overrides.services?.jscpd ?? new JscpdService(os);

  // Create shared impactCalculator instance with injected services
  const impactCalculator =
    overrides.services?.impactCalculator ??
    new ImpactCalculator(sccService, jscpdService, os);

  // sharedFossil must be explicitly injected - no auto-instantiation
  const sharedFossilServer =
    overrides.services && "sharedFossil" in overrides.services
      ? overrides.services.sharedFossil!
      : null;

  const fileService = overrides.services?.fileService ?? createFileService(os);

  const expertService =
    overrides.services?.expert ?? createExpertService(os);

  const services: MimoContext["services"] = {
    auth: overrides.services?.auth ?? new JwtService(env.JWT_SECRET),
    agents:
      overrides.services?.agents ??
      new AgentService(repos.agents, env.JWT_SECRET),
    chat: overrides.services?.chat ?? new ChatService(paths, os),
    frameState: overrides.services?.frameState ?? new FrameStateService(paths, os),
    scc: sccService,
    jscpd: jscpdService,
    commits:
      overrides.services?.commits ??
      new CommitService({
        sessionRepository: repos.sessions,
        projectRepository: repos.projects,
        impactRepository: repos.impacts,
        impactCalculator,
        vcs,
        os,
      }),
    fileSync:
      overrides.services?.fileSync ??
      new FileSyncService({
        sessionRepository: repos.sessions,
        sccService,
        os,
      }),
    autoCommit:
      overrides.services?.autoCommit ??
      new AutoCommitService({
        commitService:
          overrides.services?.commits ??
          new CommitService({
            sessionRepository: repos.sessions,
            projectRepository: repos.projects,
            impactRepository: repos.impacts,
            impactCalculator,
            vcs,
            os,
          }),
        sessionRepository: repos.sessions,
        impactCalculator,
      }),
    mcpServer:
      overrides.services?.mcpServer ?? new McpServerService(repos.mcpServers),
    config: overrides.services?.config ?? new ConfigService(os, paths.config),
    impactCalculator,
    vcs,
    sessionState: sessionStateService,
    sharedFossil: sharedFossilServer,
    fileWatcher: overrides.services?.fileWatcher ?? createFileWatcherService(os),
    expert: expertService,
  };

  return {
    env,
    paths,
    repos,
    services,
  };
}
