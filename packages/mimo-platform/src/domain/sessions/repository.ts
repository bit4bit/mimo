// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import { dump, load } from "js-yaml";
import crypto from "crypto";
import {
  createDefaultFrameState,
  normalizeFrameState,
  type FrameState,
} from "./frame-state.js";
import { mcpTokenStore } from "../../mcp/token-store.js";

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

export interface ChatThread {
  id: string;
  name: string;
  model: string;
  mode: string;
  acpSessionId: string | null;
  assignedAgentId: string | null;
  state: "active" | "parked" | "waking" | "disconnected";
  instructions?: string;
  brainWash: boolean;
  createdAt: string;
}

export type SessionPriority = "high" | "medium" | "low";

export interface Session {
  id: string;
  name: string;
  projectId: string;
  owner: string;
  upstreamPath: string;
  agentWorkspacePath: string;
  assignedAgentId?: string;
  status: "active" | "paused" | "closed";
  port: number | null;
  vcsPath?: string;
  agentWorkspaceUser?: string;
  agentWorkspacePassword?: string;
  agentSubpath?: string;
  branch?: string;
  clonePort?: number;
  /**
   * Commit SHA in `agentWorkspacePath`'s git that represents the current
   * upstream state — the "before" endpoint of the commit preview's
   * `<baseline>..HEAD` range. Initialized to the seeded base commit and
   * advanced after each selective commit. Absent on sessions that predate
   * git-range detection (those fall back to the two-tree scan).
   */
  baseline?: string;
  priority: SessionPriority;
  // MCP Server attachments
  mcpServerIds: string[];
  // ACP Session Parking fields
  idleTimeoutMs: number;
  sessionTtlDays: number;
  lastActivityAt: string | null;
  acpStatus: "active" | "parked";
  syncState: "idle" | "syncing" | "error";
  lastSyncAt?: string;
  lastSyncError?: string;
  modelState?: ModelState;
  modeState?: ModeState;
  frameState: FrameState;
  // Chat threads
  chatThreads: ChatThread[];
  activeChatThreadId: string | null;
  activeExpertThreadId: string | null;
  mcpToken: string;
  instructions?: string;
  closeReason?: string;
  createdAt: Date;
  updatedAt: Date;
  browserNotificationsEnabled: boolean;
}

export interface SessionData {
  id: string;
  name: string;
  projectId: string;
  owner: string;
  upstreamPath: string;
  agentWorkspacePath: string;
  assignedAgentId?: string;
  status: "active" | "paused" | "closed";
  port: number | null;
  vcsPath?: string;
  agentWorkspaceUser?: string;
  agentWorkspacePassword?: string;
  agentSubpath?: string;
  branch?: string;
  clonePort?: number;
  baseline?: string;
  priority?: SessionPriority;
  // MCP Server attachments
  mcpServerIds?: string[];
  // ACP Session Parking fields
  idleTimeoutMs?: number;
  sessionTtlDays?: number;
  lastActivityAt?: string | null;
  acpStatus?: "active" | "parked";
  syncState?: "idle" | "syncing" | "error";
  lastSyncAt?: string;
  lastSyncError?: string;
  modelState?: ModelState;
  modeState?: ModeState;
  frameState?: FrameState;
  // Chat threads
  chatThreads?: ChatThread[];
  activeChatThreadId?: string | null;
  activeExpertThreadId?: string | null;
  mcpToken?: string;
  closeReason?: string;
  instructions?: string;
  createdAt: string;
  updatedAt: string;
  browserNotificationsEnabled?: boolean;
}

export interface CreateSessionInput {
  name: string;
  projectId: string;
  owner: string;
  assignedAgentId?: string;
  agentSubpath?: string;
  branchName?: string;
  mcpServerIds?: string[];
  sessionTtlDays?: number;
  priority?: SessionPriority;
  instructions?: string;
  clonePort?: number;
  expertAgentId?: string;
  expertModelId?: string;
  expertModeId?: string;
}

export interface UpdateSessionConfigInput {
  idleTimeoutMs?: number;
  sessionTtlDays?: number;
  priority?: SessionPriority;
  browserNotificationsEnabled?: boolean;
}

const PRIORITY_WEIGHT: Record<SessionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function compareSessions(a: Session, b: Session): number {
  const priorityDiff =
    PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

interface SessionRepositoryDeps {
  os: OS;
  paths: {
    projects: string;
    data: string;
  };
  vcsReposDir?: string;
}

export class SessionRepository {
  private os: OS;

  constructor(private deps: SessionRepositoryDeps) {
    this.os = deps.os;
  }

  private getProjectsPath(): string {
    return this.deps.paths.projects;
  }

  private getDataPath(): string {
    return this.deps.paths.data;
  }

  private getSessionPath(projectId: string, sessionId: string): string {
    return this.os.path.join(
      this.getProjectsPath(),
      projectId,
      "sessions",
      sessionId,
    );
  }

  private getSessionFilePath(projectId: string, sessionId: string): string {
    return this.os.path.join(
      this.getSessionPath(projectId, sessionId),
      "session.yaml",
    );
  }

  private getUpstreamPath(projectId: string, sessionId: string): string {
    return this.os.path.join(
      this.getSessionPath(projectId, sessionId),
      "upstream",
    );
  }

  private getAgentWorkspacePath(projectId: string, sessionId: string): string {
    return this.os.path.join(
      this.getSessionPath(projectId, sessionId),
      "agent-workspace",
    );
  }

  private getPatchesPath(projectId: string, sessionId: string): string {
    return this.os.path.join(
      this.getSessionPath(projectId, sessionId),
      "patches",
    );
  }

  /**
   * Get the directory where all session repositories are stored centrally.
   * This is ~/.mimo/session-repos/ by default.
   * Uses lazy initialization to handle cases where paths aren't set yet.
   */
  getVcsReposDir(): string {
    if (this.deps.vcsReposDir) {
      return this.deps.vcsReposDir;
    }
    return this.os.path.join(this.getDataPath(), "session-repos");
  }

  /**
   * Get the filesystem path for a session's bare Git repository.
   * Git paths allow hyphens, so no normalization is applied.
   *
   * @param sessionId The session ID (e.g., "abc123-def456-ghi789")
   * @returns The full path to the bare repo (e.g., "~/.mimo/session-repos/abc123-def456-ghi789.git")
   */
  getSessionRepoPath(sessionId: string): string {
    return this.os.path.join(this.getVcsReposDir(), `${sessionId}.git`);
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private normalizeChatThreads(data: SessionData): {
    chatThreads: ChatThread[];
    activeChatThreadId: string | null;
    activeExpertThreadId: string | null;
  } {
    const chatThreads = (data.chatThreads ?? []).map((t: any) => ({
      ...t,
      brainWash: t.brainWash ?? false,
    }));
    const hasActiveThread =
      typeof data.activeChatThreadId === "string" &&
      chatThreads.some((thread) => thread.id === data.activeChatThreadId);
    const hasActiveExpert =
      typeof data.activeExpertThreadId === "string" &&
      chatThreads.some((thread) => thread.id === data.activeExpertThreadId);

    return {
      chatThreads,
      activeChatThreadId: hasActiveThread
        ? (data.activeChatThreadId as string)
        : (chatThreads[0]?.id ?? null),
      activeExpertThreadId: hasActiveExpert
        ? (data.activeExpertThreadId as string)
        : data.activeExpertThreadId === null
          ? null
          : null,
    };
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const id = this.generateId();
    const sessionPath = this.getSessionPath(input.projectId, id);
    const upstreamPath = this.getUpstreamPath(input.projectId, id);
    const agentWorkspacePath = this.getAgentWorkspacePath(input.projectId, id);

    // Create session directory
    if (!this.os.fs.exists(sessionPath)) {
      this.os.fs.mkdir(sessionPath, { recursive: true });
    }

    // Create upstream directory
    if (!this.os.fs.exists(upstreamPath)) {
      this.os.fs.mkdir(upstreamPath, { recursive: true });
    }

    // Create agent-workspace directory
    if (!this.os.fs.exists(agentWorkspacePath)) {
      this.os.fs.mkdir(agentWorkspacePath, { recursive: true });
    }

    // Create patches directory for historical patch storage
    const patchesPath = this.getPatchesPath(input.projectId, id);
    if (!this.os.fs.exists(patchesPath)) {
      this.os.fs.mkdir(patchesPath, { recursive: true });
    }

    const now = new Date().toISOString();
    const mcpToken = crypto.randomUUID();
    const sessionData: SessionData = {
      id,
      name: input.name,
      projectId: input.projectId,
      owner: input.owner,
      upstreamPath,
      agentWorkspacePath,
      assignedAgentId: input.assignedAgentId,
      status: "active",
      port: null,
      // MCP Server defaults
      mcpServerIds: input.mcpServerIds || [],
      priority: input.priority ?? "medium",
      // ACP Session Parking defaults
      idleTimeoutMs: 600000, // 10 minutes default
      sessionTtlDays: input.sessionTtlDays ?? 180,
      lastActivityAt: null,
      acpStatus: "active",
      syncState: "idle",
      frameState: createDefaultFrameState(),
      // Chat threads
      chatThreads: [],
      activeChatThreadId: null,
      activeExpertThreadId: null,
      mcpToken,
      createdAt: now,
      updatedAt: now,
      ...(input.agentSubpath && { agentSubpath: input.agentSubpath }),
      ...(input.branchName && { branch: input.branchName }),
      ...(input.instructions && { instructions: input.instructions }),
      ...(input.clonePort != null && { clonePort: input.clonePort }),
    };

    this.os.fs.writeFile(
      this.getSessionFilePath(input.projectId, id),
      dump(sessionData),
      { encoding: "utf-8" },
    );

    // Register MCP token in the token store
    mcpTokenStore.register(mcpToken, id);

    return {
      ...sessionData,
      browserNotificationsEnabled: false,
      chatThreads: sessionData.chatThreads!,
      activeChatThreadId: sessionData.activeChatThreadId ?? null,
      activeExpertThreadId: sessionData.activeExpertThreadId ?? null,
      createdAt: new Date(sessionData.createdAt),
      updatedAt: new Date(sessionData.updatedAt),
    };
  }

  async findById(sessionId: string): Promise<Session | null> {
    // Search across all projects for the session
    const Paths = { projects: this.getProjectsPath() };
    if (!this.os.fs.exists(Paths.projects)) {
      return null;
    }

    const projectEntries = this.os.fs.readdir(Paths.projects, {
      withFileTypes: true,
    }) as import("../os/types.js").DirEnt[];

    for (const projectEntry of projectEntries) {
      if (projectEntry.isDirectory()) {
        const sessionsDir = this.os.path.join(
          Paths.projects,
          projectEntry.name,
          "sessions",
        );
        if (this.os.fs.exists(sessionsDir)) {
          const sessionFile = this.os.path.join(
            sessionsDir,
            sessionId,
            "session.yaml",
          );
          if (this.os.fs.exists(sessionFile)) {
            const content = this.os.fs.readFile(sessionFile, "utf-8");
            const data = load(content) as SessionData;
            // Handle migration from checkoutPath to agentWorkspacePath
            // Handle ACP Session Parking defaults (backward compatibility)
            // Handle MCP Server defaults (backward compatibility)
            const { chatThreads, activeChatThreadId, activeExpertThreadId } =
              this.normalizeChatThreads(data);
            const sessionData = {
              ...data,
              agentWorkspacePath:
                data.agentWorkspacePath || (data as any).checkoutPath,
              idleTimeoutMs: data.idleTimeoutMs ?? 600000,
              sessionTtlDays: data.sessionTtlDays ?? 180,
              lastActivityAt: data.lastActivityAt ?? null,
              acpStatus: data.acpStatus ?? "active",
              syncState: data.syncState ?? "idle",
              mcpServerIds: data.mcpServerIds ?? [],
              priority: data.priority ?? "medium",
              frameState: normalizeFrameState(data.frameState),
              chatThreads,
              activeChatThreadId,
              activeExpertThreadId,
              mcpToken: data.mcpToken ?? "",
              browserNotificationsEnabled:
                data.browserNotificationsEnabled ?? false,
            };
            return {
              ...sessionData,
              createdAt: new Date(data.createdAt),
              updatedAt: new Date(data.updatedAt),
            };
          }
        }
      }
    }

    return null;
  }

  async findByProjectAndId(
    projectId: string,
    sessionId: string,
  ): Promise<Session | null> {
    const filePath = this.getSessionFilePath(projectId, sessionId);
    if (!this.os.fs.exists(filePath)) {
      return null;
    }

    const content = this.os.fs.readFile(filePath, "utf-8");
    const data = load(content) as SessionData;
    // Handle migration from checkoutPath to agentWorkspacePath
    // Handle ACP Session Parking defaults (backward compatibility)
    const { chatThreads, activeChatThreadId, activeExpertThreadId } =
      this.normalizeChatThreads(data);
    const sessionData = {
      ...data,
      agentWorkspacePath: data.agentWorkspacePath || (data as any).checkoutPath,
      idleTimeoutMs: data.idleTimeoutMs ?? 600000,
      sessionTtlDays: data.sessionTtlDays ?? 180,
      lastActivityAt: data.lastActivityAt ?? null,
      acpStatus: data.acpStatus ?? "active",
      syncState: data.syncState ?? "idle",
      priority: data.priority ?? "medium",
      frameState: normalizeFrameState(data.frameState),
      chatThreads,
      activeChatThreadId,
      activeExpertThreadId,
      mcpToken: data.mcpToken ?? "",
      browserNotificationsEnabled: data.browserNotificationsEnabled ?? false,
    };

    return {
      ...sessionData,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
  }

  async listByProject(projectId: string): Promise<Session[]> {
    const sessionsDir = this.os.path.join(
      this.getProjectsPath(),
      projectId,
      "sessions",
    );
    if (!this.os.fs.exists(sessionsDir)) {
      return [];
    }

    const entries = this.os.fs.readdir(sessionsDir, {
      withFileTypes: true,
    }) as import("../os/types.js").DirEnt[];
    const sessions: Session[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionFile = this.os.path.join(
          sessionsDir,
          entry.name,
          "session.yaml",
        );
        if (this.os.fs.exists(sessionFile)) {
          const content = this.os.fs.readFile(sessionFile, "utf-8");
          const data = load(content) as SessionData;
          // Handle migration from checkoutPath to agentWorkspacePath
          // Handle ACP Session Parking defaults (backward compatibility)
          const { chatThreads, activeChatThreadId, activeExpertThreadId } =
            this.normalizeChatThreads(data);
          const sessionData = {
            ...data,
            agentWorkspacePath:
              data.agentWorkspacePath || (data as any).checkoutPath,
            idleTimeoutMs: data.idleTimeoutMs ?? 600000,
            sessionTtlDays: data.sessionTtlDays ?? 180,
            lastActivityAt: data.lastActivityAt ?? null,
            acpStatus: data.acpStatus ?? "active",
            syncState: data.syncState ?? "idle",
            priority: data.priority ?? "medium",
            frameState: normalizeFrameState(data.frameState),
            chatThreads,
            activeChatThreadId,
            activeExpertThreadId,
            mcpToken: data.mcpToken ?? "",
            browserNotificationsEnabled:
              data.browserNotificationsEnabled ?? false,
          };
          sessions.push({
            ...sessionData,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
          });
        }
      }
    }

    return sessions.sort(compareSessions);
  }

  async listAll(): Promise<Session[]> {
    const projectsPath = this.getProjectsPath();
    if (!this.os.fs.exists(projectsPath)) {
      return [];
    }

    const projectEntries = this.os.fs.readdir(projectsPath, {
      withFileTypes: true,
    }) as import("../os/types.js").DirEnt[];
    const sessions: Session[] = [];

    for (const projectEntry of projectEntries) {
      if (!projectEntry.isDirectory()) {
        continue;
      }

      const projectSessions = await this.listByProject(projectEntry.name);
      sessions.push(...projectSessions);
    }

    return sessions.sort(compareSessions);
  }

  async findByAssignedAgentId(agentId: string): Promise<Session[]> {
    const Paths = { projects: this.getProjectsPath() };
    if (!this.os.fs.exists(Paths.projects)) {
      return [];
    }

    const projectEntries = this.os.fs.readdir(Paths.projects, {
      withFileTypes: true,
    }) as import("../os/types.js").DirEnt[];
    const sessions: Session[] = [];

    for (const projectEntry of projectEntries) {
      if (projectEntry.isDirectory()) {
        const sessionsDir = this.os.path.join(
          Paths.projects,
          projectEntry.name,
          "sessions",
        );
        if (this.os.fs.exists(sessionsDir)) {
          const entries = this.os.fs.readdir(sessionsDir, {
            withFileTypes: true,
          }) as import("../os/types.js").DirEnt[];
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const sessionFile = this.os.path.join(
                sessionsDir,
                entry.name,
                "session.yaml",
              );
              if (this.os.fs.exists(sessionFile)) {
                const content = this.os.fs.readFile(sessionFile, "utf-8");
                const data = load(content) as SessionData;
                // Handle migration from checkoutPath to agentWorkspacePath
                // Handle ACP Session Parking defaults (backward compatibility)
                const {
                  chatThreads,
                  activeChatThreadId,
                  activeExpertThreadId,
                } = this.normalizeChatThreads(data);
                const sessionData = {
                  ...data,
                  agentWorkspacePath:
                    data.agentWorkspacePath || (data as any).checkoutPath,
                  idleTimeoutMs: data.idleTimeoutMs ?? 600000,
                  sessionTtlDays: data.sessionTtlDays ?? 180,
                  lastActivityAt: data.lastActivityAt ?? null,
                  acpStatus: data.acpStatus ?? "active",
                  syncState: data.syncState ?? "idle",
                  priority: data.priority ?? "medium",
                  frameState: normalizeFrameState(data.frameState),
                  chatThreads,
                  activeChatThreadId,
                  activeExpertThreadId,
                  mcpToken: data.mcpToken ?? "",
                  browserNotificationsEnabled:
                    data.browserNotificationsEnabled ?? false,
                };
                if (data.assignedAgentId === agentId) {
                  sessions.push({
                    ...sessionData,
                    createdAt: new Date(data.createdAt),
                    updatedAt: new Date(data.updatedAt),
                  });
                }
              }
            }
          }
        }
      }
    }

    return sessions.sort(compareSessions);
  }

  async findByThreadAgentId(agentId: string): Promise<Session[]> {
    const projectsPath = this.getProjectsPath();
    if (!this.os.fs.exists(projectsPath)) return [];

    const projectEntries = this.os.fs.readdir(projectsPath, {
      withFileTypes: true,
    }) as import("../os/types.js").DirEnt[];
    const sessions: Session[] = [];

    for (const projectEntry of projectEntries) {
      if (!projectEntry.isDirectory()) continue;
      const sessionsDir = this.os.path.join(
        projectsPath,
        projectEntry.name,
        "sessions",
      );
      if (!this.os.fs.exists(sessionsDir)) continue;

      const entries = this.os.fs.readdir(sessionsDir, {
        withFileTypes: true,
      }) as import("../os/types.js").DirEnt[];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sessionFile = this.os.path.join(
          sessionsDir,
          entry.name,
          "session.yaml",
        );
        if (!this.os.fs.exists(sessionFile)) continue;

        const content = this.os.fs.readFile(sessionFile, "utf-8");
        const data = load(content) as SessionData;
        const hasThread = (data.chatThreads ?? []).some(
          (t) => t.assignedAgentId === agentId,
        );
        if (!hasThread) continue;

        const { chatThreads, activeChatThreadId, activeExpertThreadId } =
          this.normalizeChatThreads(data);
        sessions.push({
          ...data,
          agentWorkspacePath:
            data.agentWorkspacePath || (data as any).checkoutPath,
          idleTimeoutMs: data.idleTimeoutMs ?? 600000,
          sessionTtlDays: data.sessionTtlDays ?? 180,
          lastActivityAt: data.lastActivityAt ?? null,
          acpStatus: data.acpStatus ?? "active",
          syncState: data.syncState ?? "idle",
          mcpServerIds: data.mcpServerIds ?? [],
          priority: data.priority ?? "medium",
          frameState: normalizeFrameState(data.frameState),
          chatThreads,
          activeChatThreadId,
          activeExpertThreadId,
          mcpToken: data.mcpToken ?? "",
          browserNotificationsEnabled:
            data.browserNotificationsEnabled ?? false,
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
        });
      }
    }

    return sessions.sort(compareSessions);
  }

  async update(
    sessionId: string,
    updates: Partial<Omit<SessionData, "id" | "createdAt">>,
  ): Promise<Session | null> {
    const session = await this.findById(sessionId);
    if (!session) return null;

    const updatedData: SessionData = {
      ...session,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const filePath = this.getSessionFilePath(session.projectId, sessionId);
    this.os.fs.writeFile(filePath, dump(updatedData), { encoding: "utf-8" });

    return {
      ...updatedData,
      createdAt: new Date(updatedData.createdAt),
      updatedAt: new Date(updatedData.updatedAt),
    };
  }

  async addChatThread(
    sessionId: string,
    thread: Omit<ChatThread, "id" | "createdAt"> & {
      assignedAgentId?: string | null;
    },
  ): Promise<ChatThread> {
    const session = await this.findById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const duplicate = session.chatThreads.some((t) => t.name === thread.name);
    if (duplicate) {
      throw new Error(
        `A thread with name '${thread.name}' already exists in this session`,
      );
    }

    const newThread: ChatThread = {
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      assignedAgentId: null,
      ...thread,
    };

    const updatedThreads = [...session.chatThreads, newThread];
    await this.update(sessionId, {
      chatThreads: updatedThreads,
      activeChatThreadId: session.activeChatThreadId ?? newThread.id,
    });
    return newThread;
  }

  async updateChatThread(
    sessionId: string,
    threadId: string,
    updates: Partial<
      Pick<
        ChatThread,
        | "name"
        | "model"
        | "mode"
        | "acpSessionId"
        | "state"
        | "instructions"
        | "brainWash"
      >
    >,
  ): Promise<ChatThread | null> {
    const session = await this.findById(sessionId);
    if (!session) return null;

    const idx = session.chatThreads.findIndex((t) => t.id === threadId);
    if (idx === -1) return null;

    if (updates.name !== undefined) {
      const duplicate = session.chatThreads.some(
        (t) => t.name === updates.name && t.id !== threadId,
      );
      if (duplicate) {
        throw new Error(
          `A thread with name '${updates.name}' already exists in this session`,
        );
      }
    }

    const updatedThread = { ...session.chatThreads[idx], ...updates };
    const updatedThreads = [...session.chatThreads];
    updatedThreads[idx] = updatedThread;
    await this.update(sessionId, { chatThreads: updatedThreads });
    return updatedThread;
  }

  async removeChatThread(sessionId: string, threadId: string): Promise<void> {
    const session = await this.findById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const updatedThreads = session.chatThreads.filter((t) => t.id !== threadId);
    const updates: Partial<SessionData> = { chatThreads: updatedThreads };

    // If we deleted the active thread, fall back to the first remaining thread
    if (session.activeChatThreadId === threadId) {
      updates.activeChatThreadId = updatedThreads[0]?.id ?? null;
    }
    // If we deleted the active expert thread, clear the pointer
    if (session.activeExpertThreadId === threadId) {
      updates.activeExpertThreadId = null;
    }

    await this.update(sessionId, updates);
  }

  async setActiveChatThread(
    sessionId: string,
    threadId: string,
  ): Promise<void> {
    const session = await this.findById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const exists = session.chatThreads.some((t) => t.id === threadId);
    if (!exists)
      throw new Error(`Thread ${threadId} not found in session ${sessionId}`);

    await this.update(sessionId, { activeChatThreadId: threadId });
  }

  async setActiveExpertThread(
    sessionId: string,
    threadId: string | null,
  ): Promise<void> {
    const session = await this.findById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    if (threadId !== null) {
      const exists = session.chatThreads.some((t) => t.id === threadId);
      if (!exists)
        throw new Error(`Thread ${threadId} not found in session ${sessionId}`);
    }

    await this.update(sessionId, { activeExpertThreadId: threadId });
  }

  async delete(projectId: string, sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(projectId, sessionId);

    // Delete the centralized bare git session repository
    const repoPath = this.getSessionRepoPath(sessionId);
    if (this.os.fs.exists(repoPath)) {
      await this.os.fs.rmAsync(repoPath, { recursive: true, force: true });
    }

    // Delete entire session directory (includes upstream/, agent-workspace/, session.yaml)
    if (this.os.fs.exists(sessionPath)) {
      await this.deleteDirectoryRecursive(sessionPath);
    }
  }

  private async deleteDirectoryRecursive(dirPath: string): Promise<void> {
    if (!this.os.fs.exists(dirPath)) return;

    const entries = this.os.fs.readdir(dirPath, {
      withFileTypes: true,
    }) as import("../os/types.js").DirEnt[];

    for (const entry of entries) {
      const entryPath = this.os.path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await this.deleteDirectoryRecursive(entryPath);
      } else {
        await this.os.fs.unlinkAsync(entryPath);
      }
    }

    await this.os.fs.rmAsync(dirPath, { recursive: true, force: true });
  }

  async exists(projectId: string, sessionId: string): Promise<boolean> {
    return this.os.fs.exists(this.getSessionFilePath(projectId, sessionId));
  }

  async updateSessionConfig(
    sessionId: string,
    config: UpdateSessionConfigInput,
  ): Promise<Session | null> {
    const session = await this.findById(sessionId);
    if (!session) return null;

    // Validate idleTimeoutMs if provided
    if (config.idleTimeoutMs !== undefined) {
      if (config.idleTimeoutMs !== 0 && config.idleTimeoutMs < 10000) {
        throw new Error(
          "idleTimeoutMs must be at least 10000ms or 0 to disable",
        );
      }
    }

    if (config.sessionTtlDays !== undefined) {
      if (
        !Number.isInteger(config.sessionTtlDays) ||
        config.sessionTtlDays < 1
      ) {
        throw new Error("sessionTtlDays must be an integer >= 1");
      }
    }

    if (config.priority !== undefined) {
      const valid: SessionPriority[] = ["high", "medium", "low"];
      if (!valid.includes(config.priority)) {
        throw new Error("priority must be one of: high, medium, low");
      }
    }

    const updates: Partial<SessionData> = {};
    if (config.browserNotificationsEnabled !== undefined) {
      if (typeof config.browserNotificationsEnabled !== "boolean") {
        throw new Error("browserNotificationsEnabled must be a boolean");
      }
      updates.browserNotificationsEnabled = config.browserNotificationsEnabled;
    }
    if (config.idleTimeoutMs !== undefined) {
      updates.idleTimeoutMs = config.idleTimeoutMs;
    }
    if (config.sessionTtlDays !== undefined) {
      updates.sessionTtlDays = config.sessionTtlDays;
    }
    if (config.priority !== undefined) {
      updates.priority = config.priority;
    }

    return this.update(sessionId, updates);
  }

  async touchSessionActivity(
    sessionId: string,
    timestamp: string = new Date().toISOString(),
  ): Promise<Session | null> {
    return this.update(sessionId, { lastActivityAt: timestamp });
  }
}
