import crypto from "crypto";

type SessionLike = {
  id: string;
  agentWorkspaceUser?: string;
  agentWorkspacePassword?: string;
};

type SessionRepositoryLike = {
  listAll: () => Promise<SessionLike[]>;
  getFossilPath: (sessionId: string) => string;
  update: (
    sessionId: string,
    updates: { agentWorkspaceUser: string; agentWorkspacePassword: string },
  ) => Promise<unknown>;
};

type VcsLike = {
  createFossilUser: (
    repoPath: string,
    username: string,
    password: string,
    capabilities?: string,
  ) => Promise<{ success: boolean; error?: string }>;
};

type MigrationStatus = "updated" | "skipped" | "failed";

export interface DevWorkspaceMigrationResult {
  summary: {
    total: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  sessions: Array<{
    sessionId: string;
    status: MigrationStatus;
    reason: string;
  }>;
}

export async function migrateDevWorkspaceUsers(input: {
  sessionRepository: SessionRepositoryLike;
  vcs: VcsLike;
  dryRun?: boolean;
}): Promise<DevWorkspaceMigrationResult> {
  const dryRun = input.dryRun ?? false;
  const sessions = await input.sessionRepository.listAll();

  const result: DevWorkspaceMigrationResult = {
    summary: {
      total: sessions.length,
      updated: 0,
      skipped: 0,
      failed: 0,
    },
    sessions: [],
  };

  for (const session of sessions) {
    const alreadyConfigured =
      session.agentWorkspaceUser === "dev" &&
      typeof session.agentWorkspacePassword === "string" &&
      session.agentWorkspacePassword.length > 0;

    const password = alreadyConfigured
      ? (session.agentWorkspacePassword as string)
      : crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    if (alreadyConfigured) {
      result.summary.skipped += 1;
      result.sessions.push({
        sessionId: session.id,
        status: "skipped",
        reason: "already configured",
      });
      continue;
    }

    if (dryRun) {
      result.summary.updated += 1;
      result.sessions.push({
        sessionId: session.id,
        status: "updated",
        reason: "would backfill dev credentials",
      });
      continue;
    }

    const fossilPath = input.sessionRepository.getFossilPath(session.id);
    const userResult = await input.vcs.createFossilUser(
      fossilPath,
      "dev",
      password,
      "s",
    );

    if (!userResult.success) {
      result.summary.failed += 1;
      result.sessions.push({
        sessionId: session.id,
        status: "failed",
        reason: userResult.error || "failed to create dev user",
      });
      continue;
    }

    await input.sessionRepository.update(session.id, {
      agentWorkspaceUser: "dev",
      agentWorkspacePassword: password,
    });

    result.summary.updated += 1;
    result.sessions.push({
      sessionId: session.id,
      status: "updated",
      reason: "backfilled dev credentials",
    });
  }

  return result;
}
