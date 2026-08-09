// SPDX-License-Identifier: AGPL-3.0-only
import { AgentRepository } from "../../domain/agents/repository.js";
import { SessionRepository } from "../../domain/sessions/repository.js";
import { AgentService } from "../../domain/agents/service.js";
import { JwtService } from "../../domain/auth/jwt.js";
import { UserRepository } from "../../domain/auth/user.js";
import { ProjectRepository } from "../../domain/projects/repository.js";
import { McpServerRepository } from "../../domain/mcp-servers/repository.js";
import { CredentialRepository } from "../../domain/credentials/repository.js";
import { ManagedRepositoryRepository } from "../../domain/repositories/repository.js";
import { ImpactRepository } from "../../domain/impact/repository.js";
import {
  FilePinnedSessionsRepository,
  type PinnedSessionsRepository,
} from "../../domain/pinned-sessions/repository.js";
import {
  FileFeatureRepository,
  type FeatureRepository,
} from "../../domain/features/repository.js";
import { ChatService } from "../../domain/sessions/chat.js";
import { FrameStateService } from "../../domain/sessions/frame-state.js";
import { SccService } from "../../domain/impact/scc-service.js";
import { JscpdService } from "../../domain/impact/jscpd-service.js";
import { CommitService } from "../../domain/commits/service.js";
import { FileSyncService } from "../../domain/sync/service.js";
import { AutoCommitService } from "../../domain/auto-commit/service.js";
import { McpServerService } from "../../domain/mcp-servers/service.js";
import { ConfigService } from "../../domain/config/service.js";
import { ImpactCalculator } from "../../domain/impact/calculator.js";
import { VCS } from "../../domain/vcs/index.js";
import { sessionStateService } from "../../domain/sessions/state.js";
import { ChangedFilesCache } from "../../domain/commits/changed-files-cache.js";
import { logger } from "../../logger.js";
import {
  GitHttpServer,
  DummyGitHttpServer,
} from "../../domain/vcs/git-http-server.js";
import type {
  GitHttpServerConfig,
  CredentialVerifier,
} from "../../domain/vcs/git-http-server.js";
import {
  createFileWatcherService,
  type FileWatcherService,
} from "../../domain/files/file-watcher-service.js";
import {
  ExpertService,
  createExpertService,
} from "../../domain/files/expert-service.js";
import { createSearchService } from "../../domain/files/search-service.js";
import type { SearchService } from "../../domain/files/types.js";
import { createFileService } from "../../domain/files/service.js";
import type { FileService } from "../../domain/files/types.js";
import {
  createProjectVcsCache,
  type ProjectVcsCache,
} from "../../domain/projects/vcs-cache.js";
import {
  createProjectDeletionUseCase,
  type ProjectDeletionLike,
} from "../../domain/projects/project-deletion.js";
import {
  createSessionDeletionUseCase,
  type SessionDeletionLike,
} from "../../domain/sessions/session-deletion.js";
import { mcpTokenStore } from "../../mcp/token-store.js";
import { createOS } from "../os/node-adapter.js";
import type { OS } from "../os/types.js";

export const DEFAULT_MIMO_HOST = "localhost";

export interface MimoEnv {
  PORT: number;
  PLATFORM_URL: string;
  JWT_SECRET: string;
  MIMO_HOME: string;
  MIMO_VCS_REPOS_DIR: string;
  MIMO_INTERNAL_VCS_PORT: number | undefined;
  MIMO_HOST: string;
  /**
   * Internal hostname the agent uses to reach the platform's VCS (git) HTTP
   * server, embedded in the clone URL sent to agents. Falls back to MIMO_HOST.
   */
  MIMO_INTERNAL_VCS_HOST?: string;
  /**
   * Public-facing base URL for the clone command shown to browser users
   * (e.g. `https://yourdomain.com/git`). When unset, the UI derives the URL
   * from the internal server host. Distinct from the internal agent address.
   */
  MIMO_PUBLIC_VCS_URL?: string;
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
    managedRepositories: ManagedRepositoryRepository;
    impacts: ImpactRepository;
    pinnedSessions: PinnedSessionsRepository;
    features: FeatureRepository;
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
    sharedVcs: GitHttpServer | DummyGitHttpServer | null;
    fileWatcher: FileWatcherService;
    expert: ExpertService;
    search: SearchService;
    fileService: FileService;
    projectVcsCache: ProjectVcsCache;
    changedFilesCache: ChangedFilesCache;
    projectDeletion: ProjectDeletionLike;
    sessionDeletion: SessionDeletionLike;
    os: OS;
  };
}

type CreateMimoContextOverrides = {
  env?: Partial<MimoEnv>;
  repos?: Partial<MimoContext["repos"]>;
  services?: Partial<MimoContext["services"]>;
  os?: OS;
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
 * Factory function to create a GitHttpServer with configuration from MimoEnv.
 * Port is required - throws error if not provided.
 *
 * @param verifyCredentials Basic-auth verifier; validates (sid, user, pass)
 *   against the session-stored credentials.
 */
export function createGitHttpServer(
  env: MimoEnv,
  os: OS,
  verifyCredentials: CredentialVerifier,
): GitHttpServer {
  const port = env.MIMO_INTERNAL_VCS_PORT;
  if (port === undefined) {
    throw new Error("MIMO_INTERNAL_VCS_PORT is required in environment");
  }

  const config: GitHttpServerConfig = {
    port,
    reposDir: env.MIMO_VCS_REPOS_DIR,
    host: env.MIMO_INTERNAL_VCS_HOST ?? env.MIMO_HOST,
    verifyCredentials,
  };

  return new GitHttpServer(config, os);
}

export function createMimoContext(
  overrides: CreateMimoContextOverrides = {},
): MimoContext {
  // Use injected OS if provided, otherwise create new one
  const os: OS =
    overrides.os ??
    createOS({
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...process.env,
    });

  const mimoHome =
    overrides.env?.MIMO_HOME ?? os.path.join(os.homeDir(), ".mimo");
  const port = overrides.env?.PORT ?? 3000;
  const host = overrides.env?.MIMO_HOST ?? DEFAULT_MIMO_HOST;
  const env: MimoEnv = {
    PORT: port,
    PLATFORM_URL: overrides.env?.PLATFORM_URL ?? `http://${host}:${port}`,
    JWT_SECRET: overrides.env?.JWT_SECRET ?? "",
    MIMO_HOME: mimoHome,
    MIMO_VCS_REPOS_DIR:
      overrides.env?.MIMO_VCS_REPOS_DIR ??
      os.path.join(mimoHome, "session-repos"),
    MIMO_INTERNAL_VCS_PORT: overrides.env?.MIMO_INTERNAL_VCS_PORT,
    MIMO_HOST: host,
    MIMO_INTERNAL_VCS_HOST: overrides.env?.MIMO_INTERNAL_VCS_HOST,
    MIMO_PUBLIC_VCS_URL: overrides.env?.MIMO_PUBLIC_VCS_URL,
  };

  const paths = resolvePaths(env.MIMO_HOME, os);
  ensurePaths(paths, os);

  // Create VCS with injected OS
  const vcs = overrides.services?.vcs ?? new VCS({ os, host: env.MIMO_HOST });

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
        vcsReposDir: env.MIMO_VCS_REPOS_DIR,
        os,
      }),
    credentials:
      overrides.repos?.credentials ??
      new CredentialRepository({ usersPath: paths.users, os }),
    managedRepositories:
      overrides.repos?.managedRepositories ??
      new ManagedRepositoryRepository({ usersPath: paths.users, os }),
    impacts:
      overrides.repos?.impacts ??
      new ImpactRepository({ projectsPath: paths.projects, os }),
    pinnedSessions:
      overrides.repos?.pinnedSessions ??
      new FilePinnedSessionsRepository({ usersPath: paths.users, os }),
    features:
      overrides.repos?.features ??
      new FileFeatureRepository({ projectsPath: paths.projects, os }),
  };

  // Create shared scc and jscpd service instances to be passed to ImpactCalculator
  const sccService =
    overrides.services?.scc ??
    new SccService(
      os,
      os.path.join(paths.root, "bin", "scc"),
      os.path.join(paths.root, "cache"),
    );
  // Load the SCC cache asynchronously so the constructor no longer blocks the
  // main thread with synchronous disk I/O.
  sccService.initialize().catch((error) => {
    logger.error("[mimo-context] Failed to initialize SCC service:", error);
  });
  const jscpdService = overrides.services?.jscpd ?? new JscpdService(os);

  // Shared cache for patch-derived changed files, used by both commit preview
  // and impact analysis to avoid duplicate directory scans.
  const changedFilesCache =
    overrides.services?.changedFilesCache ?? new ChangedFilesCache();

  // Create shared impactCalculator instance with injected services
  const impactCalculator =
    overrides.services?.impactCalculator ??
    new ImpactCalculator(sccService, jscpdService, os, changedFilesCache);

  // sharedVcs must be explicitly injected - no auto-instantiation
  const sharedVcsServer =
    overrides.services && "sharedVcs" in overrides.services
      ? overrides.services.sharedVcs!
      : null;

  const fileService = overrides.services?.fileService ?? createFileService(os);

  const expertService = overrides.services?.expert ?? createExpertService(os);

  const sessionDeletion =
    overrides.services?.sessionDeletion ??
    createSessionDeletionUseCase({
      sessionRepository: repos.sessions,
      sessionStateService,
      fileSyncService:
        overrides.services?.fileSync ??
        new FileSyncService({
          sessionRepository: repos.sessions,
          sccService,
          os,
        }),
      impactCalculator,
      agentService:
        overrides.services?.agents ??
        new AgentService(repos.agents, env.JWT_SECRET),
      mcpTokenStore,
    });

  const projectDeletion =
    overrides.services?.projectDeletion ??
    createProjectDeletionUseCase({
      sessions: repos.sessions,
      sessionDeletion,
      pinnedSessions: repos.pinnedSessions,
      projectVcsCache:
        overrides.services?.projectVcsCache ??
        createProjectVcsCache({
          os,
          projectsPath: paths.projects,
          vcs,
        }),
      projects: repos.projects,
    });

  const services: MimoContext["services"] = {
    auth: overrides.services?.auth ?? new JwtService(env.JWT_SECRET),
    agents:
      overrides.services?.agents ??
      new AgentService(repos.agents, env.JWT_SECRET),
    chat: overrides.services?.chat ?? new ChatService(paths, os),
    frameState:
      overrides.services?.frameState ?? new FrameStateService(paths, os),
    scc: sccService,
    jscpd: jscpdService,
    commits:
      overrides.services?.commits ??
      new CommitService({
        sessionRepository: repos.sessions,
        projectRepository: repos.projects,
        credentialRepository: repos.credentials,
        managedRepositories: repos.managedRepositories,
        impactRepository: repos.impacts,
        impactCalculator,
        vcs,
        os,
        changedFilesCache,
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
            credentialRepository: repos.credentials,
            managedRepositories: repos.managedRepositories,
            impactRepository: repos.impacts,
            impactCalculator,
            vcs,
            os,
            changedFilesCache,
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
    sharedVcs: sharedVcsServer,
    fileWatcher:
      overrides.services?.fileWatcher ?? createFileWatcherService(os),
    expert: expertService,
    search: overrides.services?.search ?? createSearchService({ os }),
    fileService,
    projectVcsCache:
      overrides.services?.projectVcsCache ??
      createProjectVcsCache({
        os,
        projectsPath: paths.projects,
        vcs,
      }),
    changedFilesCache: changedFilesCache,
    sessionDeletion,
    projectDeletion,
    os,
  };

  return {
    env,
    paths,
    repos,
    services,
  };
}
