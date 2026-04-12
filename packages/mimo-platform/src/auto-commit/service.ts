import { commitService, type CommitAndPushResult } from "../commits/service.js";
import { impactCalculator } from "../impact/calculator.js";
import { sessionRepository } from "../sessions/repository.js";

export type SyncState = "idle" | "syncing" | "error";

export interface SyncStatus {
  syncState: SyncState;
  lastSyncAt?: string;
  lastSyncError?: string;
}

export interface AutoCommitResult {
  success: boolean;
  message: string;
  error?: string;
}

interface AutoCommitDependencies {
  commitService: {
    commitAndPush: (sessionId: string, commitMessage?: string) => Promise<CommitAndPushResult>;
  };
  sessionRepository: {
    findById: (sessionId: string) => Promise<any | null>;
    update: (sessionId: string, updates: Record<string, unknown>) => Promise<any | null>;
  };
  impactCalculator: {
    calculateImpact: (
      sessionId: string,
      upstreamPath: string,
      agentWorkspacePath: string,
      forceRefresh?: boolean
    ) => Promise<{ metrics: any; trends: any }>;
  };
}

export class AutoCommitService {
  constructor(
    private readonly deps: AutoCommitDependencies = {
      commitService,
      sessionRepository,
      impactCalculator,
    }
  ) {}

  async handleThoughtEnd(sessionId: string): Promise<AutoCommitResult> {
    return this.sync(sessionId);
  }

  async syncNow(sessionId: string): Promise<AutoCommitResult> {
    return this.sync(sessionId);
  }

  async getSyncStatus(sessionId: string): Promise<SyncStatus | null> {
    const session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      return null;
    }

    return {
      syncState: session.syncState || "idle",
      lastSyncAt: session.lastSyncAt,
      lastSyncError: session.lastSyncError,
    };
  }

  private async sync(sessionId: string): Promise<AutoCommitResult> {
    const session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      return { success: false, message: "Session not found", error: "Session not found" };
    }

    await this.setStatus(sessionId, { syncState: "syncing", lastSyncError: undefined });

    try {
      const commitMessage = await this.generateCommitMessage(session);
      if (!commitMessage) {
        await this.setStatus(sessionId, { syncState: "idle", lastSyncError: undefined });
        return { success: true, message: "No changes to commit" };
      }

      const result = await this.deps.commitService.commitAndPush(sessionId, commitMessage);
      if (!result.success) {
        const error = result.error || result.message || "Sync failed";
        await this.setStatus(sessionId, { syncState: "error", lastSyncError: error });
        return { success: false, message: result.message || "Sync failed", error };
      }

      await this.setStatus(sessionId, {
        syncState: "idle",
        lastSyncAt: new Date().toISOString(),
        lastSyncError: undefined,
      });

      return { success: true, message: result.message || "Changes committed and pushed successfully!" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.setStatus(sessionId, { syncState: "error", lastSyncError: errorMessage });
      return { success: false, message: "Sync failed", error: errorMessage };
    }
  }

  private async generateCommitMessage(session: {
    id: string;
    name: string;
    upstreamPath: string;
    agentWorkspacePath: string;
  }): Promise<string | null> {
    const { metrics } = await this.deps.impactCalculator.calculateImpact(
      session.id,
      session.upstreamPath,
      session.agentWorkspacePath
    );

    const fileCount = (metrics.files?.new || 0) + (metrics.files?.changed || 0) + (metrics.files?.deleted || 0);
    if (fileCount === 0) {
      return null;
    }

    const added = metrics.linesOfCode?.added || 0;
    const removed = metrics.linesOfCode?.removed || 0;

    return `[${session.name}] - ${fileCount} files changed (+${added}/-${removed} lines)`;
  }

  private async setStatus(sessionId: string, status: Partial<SyncStatus>): Promise<void> {
    await this.deps.sessionRepository.update(sessionId, status);
  }
}

export const autoCommitService = new AutoCommitService();
