import { join } from "path";
import { homedir } from "os";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "fs";
import { dump, load } from "js-yaml";
import crypto from "crypto";
import { normalizeSessionIdForFossil } from "../vcs/shared-fossil-server.js";
import {
  createDefaultFrameState,
  normalizeFrameState,
  type FrameState,
} from "./frame-state.js";

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
  state: "active" | "parked" | "waking";
  createdAt: string;
}

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
  fossilPath?: string;
  agentWorkspaceUser?: string;
  agentWorkspacePassword?: string;
  acpSessionId?: string;
  localDevMirrorPath?: string;
  agentSubpath?: string;
  branch?: string;
  // MCP Server attachments
  mcpServerIds: string[];
  // ACP Session Parking fields
  idleTimeoutMs: number;
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
  createdAt: Date;
  updatedAt: Date;
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
  fossilPath?: string;
  agentWorkspaceUser?: string;
  agentWorkspacePassword?: string;
  acpSessionId?: string;
  localDevMirrorPath?: string;
  agentSubpath?: string;
  branch?: string;
  // MCP Server attachments
  mcpServerIds?: string[];
  // ACP Session Parking fields
  idleTimeoutMs?: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionInput {
  name: string;
  projectId: string;
  owner: string;
  assignedAgentId?: string;
  localDevMirrorPath?: string;
  agentSubpath?: string;
  branchName?: string;
  mcpServerIds?: string[];
}

export interface UpdateSessionConfigInput {
  idleTimeoutMs?: number;
}

interface SessionRepositoryDeps {
  paths: {
    projects: string;
    data: string;
  };
  fossilReposDir?: string;
}

export class SessionRepository {
  constructor(private deps: SessionRepositoryDeps) {}

  private getProjectsPath(): string {
    return this.deps.paths.projects;
  }

  private getDataPath(): string {
    return this.deps.paths.data;
  }

  private getSessionPath(projectId: string, sessionId: string): string {
    return join(this.getProjectsPath(), projectId, "sessions", sessionId);
  }

  private getSessionFilePath(projectId: string, sessionId: string): string {
    return join(this.getSessionPath(projectId, sessionId), "session.yaml");
  }

  private getUpstreamPath(projectId: string, sessionId: string): string {
    return join(this.getSessionPath(projectId, sessionId), "upstream");
  }

  private getAgentWorkspacePath(projectId: string, sessionId: string): string {
    return join(this.getSessionPath(projectId, sessionId), "agent-workspace");
  }

  private getPatchesPath(projectId: string, sessionId: string): string {
    return join(this.getSessionPath(projectId, sessionId), "patches");
  }

  /**
   * Get the directory where all fossil repositories are stored centrally.
   * This is ~/.mimo/session-fossils/ by default.
   * Uses lazy initialization to handle cases where paths aren't set yet.
   */
  getFossilReposDir(): string {
    if (this.deps.fossilReposDir) {
      return this.deps.fossilReposDir;
    }
    return join(this.getDataPath(), "session-fossils");
  }

  /**
   * Get the filesystem path for a session's fossil repository.
   * The file is stored in the centralized fossil directory, not in the session directory.
   *
   * @param sessionId The session ID (e.g., "abc123-def456-ghi789")
   * @returns The full path to the .fossil file (e.g., "~/.mimo/session-fossils/abc123_def456_ghi789.fossil")
   */
  getFossilPath(sessionId: string): string {
    const normalizedId = normalizeSessionIdForFossil(sessionId);
    return join(this.getFossilReposDir(), `${normalizedId}.fossil`);
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private normalizeChatThreads(data: SessionData): {
    chatThreads: ChatThread[];
    activeChatThreadId: string | null;
  } {
    const chatThreads = data.chatThreads ?? [];
    const hasActiveThread =
      typeof data.activeChatThreadId === "string" &&
      chatThreads.some((thread) => thread.id === data.activeChatThreadId);

    return {
      chatThreads,
      activeChatThreadId: hasActiveThread
        ? (data.activeChatThreadId as string)
        : (chatThreads[0]?.id ?? null),
    };
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const id = this.generateId();
    const sessionPath = this.getSessionPath(input.projectId, id);
    const upstreamPath = this.getUpstreamPath(input.projectId, id);
    const agentWorkspacePath = this.getAgentWorkspacePath(input.projectId, id);

    // Create session directory
    if (!existsSync(sessionPath)) {
      mkdirSync(sessionPath, { recursive: true });
    }

    // Create upstream directory
    if (!existsSync(upstreamPath)) {
      mkdirSync(upstreamPath, { recursive: true });
    }

    // Create agent-workspace directory
    if (!existsSync(agentWorkspacePath)) {
      mkdirSync(agentWorkspacePath, { recursive: true });
    }

    // Create patches directory for historical patch storage
    const patchesPath = this.getPatchesPath(input.projectId, id);
    if (!existsSync(patchesPath)) {
      mkdirSync(patchesPath, { recursive: true });
    }

    const now = new Date().toISOString();
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
      // ACP Session Parking defaults
      idleTimeoutMs: 600000, // 10 minutes default
      acpStatus: "active",
      syncState: "idle",
      frameState: createDefaultFrameState(),
      // Chat threads
      chatThreads: [],
      activeChatThreadId: null,
      createdAt: now,
      updatedAt: now,
      ...(input.localDevMirrorPath && {
        localDevMirrorPath: input.localDevMirrorPath,
      }),
      ...(input.agentSubpath && { agentSubpath: input.agentSubpath }),
    };

    writeFileSync(
      this.getSessionFilePath(input.projectId, id),
      dump(sessionData),
      "utf-8",
    );

    return {
      ...sessionData,
      chatThreads: sessionData.chatThreads!,
      activeChatThreadId: sessionData.activeChatThreadId ?? null,
      createdAt: new Date(sessionData.createdAt),
      updatedAt: new Date(sessionData.updatedAt),
    };
  }

  async findById(sessionId: string): Promise<Session | null> {
    // Search across all projects for the session
    const Paths = { projects: this.getProjectsPath() };
    if (!existsSync(Paths.projects)) {
      return null;
    }

    const projectEntries = readdirSync(Paths.projects, { withFileTypes: true });

    for (const projectEntry of projectEntries) {
      if (projectEntry.isDirectory()) {
        const sessionsDir = join(Paths.projects, projectEntry.name, "sessions");
        if (existsSync(sessionsDir)) {
          const sessionFile = join(sessionsDir, sessionId, "session.yaml");
          if (existsSync(sessionFile)) {
            const content = readFileSync(sessionFile, "utf-8");
            const data = load(content) as SessionData;
            // Handle migration from checkoutPath to agentWorkspacePath
            // Handle ACP Session Parking defaults (backward compatibility)
            // Handle MCP Server defaults (backward compatibility)
            const { chatThreads, activeChatThreadId } =
              this.normalizeChatThreads(data);
            const sessionData = {
              ...data,
              agentWorkspacePath:
                data.agentWorkspacePath || (data as any).checkoutPath,
              idleTimeoutMs: data.idleTimeoutMs ?? 600000,
              acpStatus: data.acpStatus ?? "active",
              syncState: data.syncState ?? "idle",
              mcpServerIds: data.mcpServerIds ?? [],
              frameState: normalizeFrameState(data.frameState),
              chatThreads,
              activeChatThreadId,
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
    if (!existsSync(filePath)) {
      return null;
    }

    const content = readFileSync(filePath, "utf-8");
    const data = load(content) as SessionData;
    // Handle migration from checkoutPath to agentWorkspacePath
    // Handle ACP Session Parking defaults (backward compatibility)
    const { chatThreads, activeChatThreadId } = this.normalizeChatThreads(data);
    const sessionData = {
      ...data,
      agentWorkspacePath: data.agentWorkspacePath || (data as any).checkoutPath,
      idleTimeoutMs: data.idleTimeoutMs ?? 600000,
      acpStatus: data.acpStatus ?? "active",
      syncState: data.syncState ?? "idle",
      frameState: normalizeFrameState(data.frameState),
      chatThreads,
      activeChatThreadId,
    };

    return {
      ...sessionData,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
  }

  async listByProject(projectId: string): Promise<Session[]> {
    const sessionsDir = join(this.getProjectsPath(), projectId, "sessions");
    if (!existsSync(sessionsDir)) {
      return [];
    }

    const entries = readdirSync(sessionsDir, { withFileTypes: true });
    const sessions: Session[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionFile = join(sessionsDir, entry.name, "session.yaml");
        if (existsSync(sessionFile)) {
          const content = readFileSync(sessionFile, "utf-8");
          const data = load(content) as SessionData;
          // Handle migration from checkoutPath to agentWorkspacePath
          // Handle ACP Session Parking defaults (backward compatibility)
          const { chatThreads, activeChatThreadId } =
            this.normalizeChatThreads(data);
          const sessionData = {
            ...data,
            agentWorkspacePath:
              data.agentWorkspacePath || (data as any).checkoutPath,
            idleTimeoutMs: data.idleTimeoutMs ?? 600000,
            acpStatus: data.acpStatus ?? "active",
            syncState: data.syncState ?? "idle",
            frameState: normalizeFrameState(data.frameState),
            chatThreads,
            activeChatThreadId,
          };
          sessions.push({
            ...sessionData,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
          });
        }
      }
    }

    return sessions.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async findByAssignedAgentId(agentId: string): Promise<Session[]> {
    const Paths = { projects: this.getProjectsPath() };
    if (!existsSync(Paths.projects)) {
      return [];
    }

    const projectEntries = readdirSync(Paths.projects, { withFileTypes: true });
    const sessions: Session[] = [];

    for (const projectEntry of projectEntries) {
      if (projectEntry.isDirectory()) {
        const sessionsDir = join(Paths.projects, projectEntry.name, "sessions");
        if (existsSync(sessionsDir)) {
          const entries = readdirSync(sessionsDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const sessionFile = join(sessionsDir, entry.name, "session.yaml");
              if (existsSync(sessionFile)) {
                const content = readFileSync(sessionFile, "utf-8");
                const data = load(content) as SessionData;
                // Handle migration from checkoutPath to agentWorkspacePath
                // Handle ACP Session Parking defaults (backward compatibility)
                const { chatThreads, activeChatThreadId } =
                  this.normalizeChatThreads(data);
                const sessionData = {
                  ...data,
                  agentWorkspacePath:
                    data.agentWorkspacePath || (data as any).checkoutPath,
                  idleTimeoutMs: data.idleTimeoutMs ?? 600000,
                  acpStatus: data.acpStatus ?? "active",
                  syncState: data.syncState ?? "idle",
                  frameState: normalizeFrameState(data.frameState),
                  chatThreads,
                  activeChatThreadId,
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

    return sessions.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async findByThreadAgentId(agentId: string): Promise<Session[]> {
    const projectsPath = this.getProjectsPath();
    if (!existsSync(projectsPath)) return [];

    const projectEntries = readdirSync(projectsPath, { withFileTypes: true });
    const sessions: Session[] = [];

    for (const projectEntry of projectEntries) {
      if (!projectEntry.isDirectory()) continue;
      const sessionsDir = join(projectsPath, projectEntry.name, "sessions");
      if (!existsSync(sessionsDir)) continue;

      const entries = readdirSync(sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sessionFile = join(sessionsDir, entry.name, "session.yaml");
        if (!existsSync(sessionFile)) continue;

        const content = readFileSync(sessionFile, "utf-8");
        const data = load(content) as SessionData;
        const hasThread = (data.chatThreads ?? []).some(
          (t) => t.assignedAgentId === agentId,
        );
        if (!hasThread) continue;

        const { chatThreads, activeChatThreadId } =
          this.normalizeChatThreads(data);
        sessions.push({
          ...data,
          agentWorkspacePath:
            data.agentWorkspacePath || (data as any).checkoutPath,
          idleTimeoutMs: data.idleTimeoutMs ?? 600000,
          acpStatus: data.acpStatus ?? "active",
          syncState: data.syncState ?? "idle",
          mcpServerIds: data.mcpServerIds ?? [],
          frameState: normalizeFrameState(data.frameState),
          chatThreads,
          activeChatThreadId,
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
        });
      }
    }

    return sessions.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
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
    writeFileSync(filePath, dump(updatedData), "utf-8");

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
      Pick<ChatThread, "name" | "model" | "mode" | "acpSessionId" | "state">
    >,
  ): Promise<ChatThread | null> {
    const session = await this.findById(sessionId);
    if (!session) return null;

    const idx = session.chatThreads.findIndex((t) => t.id === threadId);
    if (idx === -1) return null;

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

  async delete(projectId: string, sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(projectId, sessionId);

    // Delete the centralized fossil repository file
    const fossilPath = this.getFossilPath(sessionId);
    if (existsSync(fossilPath)) {
      unlinkSync(fossilPath);
    }

    // Delete entire session directory (includes upstream/, agent-workspace/, session.yaml)
    if (existsSync(sessionPath)) {
      this.deleteDirectoryRecursive(sessionPath);
    }
  }

  private deleteDirectoryRecursive(dirPath: string): void {
    if (!existsSync(dirPath)) return;

    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        this.deleteDirectoryRecursive(entryPath);
      } else {
        unlinkSync(entryPath);
      }
    }

    rmdirSync(dirPath);
  }

  async exists(projectId: string, sessionId: string): Promise<boolean> {
    return existsSync(this.getSessionFilePath(projectId, sessionId));
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

    const updates: Partial<SessionData> = {};
    if (config.idleTimeoutMs !== undefined) {
      updates.idleTimeoutMs = config.idleTimeoutMs;
    }

    return this.update(sessionId, updates);
  }
}
