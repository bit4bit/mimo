// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { logger as defaultLogger } from "../logger.js";
import type { SessionDeletionLike } from "./session-deletion.js";
import { isSessionExpired, isSessionInactive } from "./session-retention.js";

interface RetentionSession {
  id: string;
  projectId: string;
  createdAt: Date;
  sessionTtlDays: number;
  lastActivityAt: string | null;
  assignedAgentId?: string;
}

interface SessionListRepositoryLike {
  listAll(): Promise<RetentionSession[]>;
}

interface LoggerLike {
  debug: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

interface SweepDeps {
  sessionRepository: SessionListRepositoryLike;
  sessionDeletion: SessionDeletionLike;
  now?: () => Date;
  logger?: LoggerLike;
}

export type { SessionDeletionLike };

export async function sweepExpiredInactiveSessions(
  deps: SweepDeps,
): Promise<{ checked: number; deleted: number }> {
  const now = deps.now?.() ?? new Date();
  const logger = deps.logger ?? defaultLogger;
  const sessions = await deps.sessionRepository.listAll();

  let deleted = 0;

  for (const session of sessions) {
    const expired = isSessionExpired(session, now);
    const inactive = isSessionInactive(session.lastActivityAt, now);
    if (!expired || !inactive) {
      continue;
    }

    try {
      await deps.sessionDeletion.deleteSessionByRecord(session);
      deleted += 1;
      logger.debug("[retention] deleted expired inactive session", {
        sessionId: session.id,
        projectId: session.projectId,
      });
    } catch (error) {
      logger.error("[retention] failed to delete expired session", {
        sessionId: session.id,
        projectId: session.projectId,
        error,
      });
    }
  }

  return { checked: sessions.length, deleted };
}
