// SPDX-License-Identifier: AGPL-3.0-only
import type { ImpactMetrics, ImpactTrend } from "./calculator.js";
import { logger } from "../../logger.js";

interface SessionRepoPaths {
  projectRepoId: string;
  upstreamPath: string;
  workspacePath: string;
}

interface SessionPaths {
  id: string;
  upstreamPath: string;
  agentWorkspacePath: string;
  repos?: SessionRepoPaths[];
}

interface RefreshResult {
  metrics: ImpactMetrics;
  trends: ImpactTrend;
}

interface HandleRefreshImpactOptions {
  sessionId: string;
  calculatingSessions: Set<string>;
  sendToRequester: (message: Record<string, unknown>) => void;
  broadcast: (sessionId: string, message: Record<string, unknown>) => void;
  findSessionById: (sessionId: string) => Promise<SessionPaths | null>;
  calculateImpact: (
    sessionId: string,
    upstreamPath: string,
    agentWorkspacePath: string,
    forceRefresh: boolean,
    repoId?: string,
  ) => Promise<RefreshResult>;
  repoId?: string;
  now?: () => string;
}

function emptyAggregate(): ImpactMetrics {
  return {
    files: { new: 0, changed: 0, deleted: 0, unchanged: 0 },
    linesOfCode: { added: 0, removed: 0, net: 0 },
    complexity: { cyclomatic: 0, cognitive: 0, estimatedMinutes: 0 },
    absoluteComplexity: { upstream: 0, workspace: 0 },
    absoluteLoc: {
      total: { upstream: 0, workspace: 0 },
      added: { upstream: 0, workspace: 0 },
      removed: { upstream: 0, workspace: 0 },
    },
    byLanguage: [],
    byFile: [],
  };
}

function accumulateMetrics(
  aggregate: ImpactMetrics,
  metrics: ImpactMetrics | undefined,
  repoId: string,
): void {
  if (!metrics) return;
  aggregate.files.new += metrics.files?.new ?? 0;
  aggregate.files.changed += metrics.files?.changed ?? 0;
  aggregate.files.deleted += metrics.files?.deleted ?? 0;
  aggregate.files.unchanged += metrics.files?.unchanged ?? 0;
  aggregate.linesOfCode.added += metrics.linesOfCode?.added ?? 0;
  aggregate.linesOfCode.removed += metrics.linesOfCode?.removed ?? 0;
  aggregate.linesOfCode.net += metrics.linesOfCode?.net ?? 0;
  aggregate.complexity.cyclomatic += metrics.complexity?.cyclomatic ?? 0;
  aggregate.complexity.cognitive += metrics.complexity?.cognitive ?? 0;
  aggregate.complexity.estimatedMinutes +=
    metrics.complexity?.estimatedMinutes ?? 0;
  aggregate.absoluteComplexity.upstream +=
    metrics.absoluteComplexity?.upstream ?? 0;
  aggregate.absoluteComplexity.workspace +=
    metrics.absoluteComplexity?.workspace ?? 0;
  aggregate.absoluteLoc.total.upstream +=
    metrics.absoluteLoc?.total?.upstream ?? 0;
  aggregate.absoluteLoc.total.workspace +=
    metrics.absoluteLoc?.total?.workspace ?? 0;
  aggregate.absoluteLoc.added.upstream +=
    metrics.absoluteLoc?.added?.upstream ?? 0;
  aggregate.absoluteLoc.added.workspace +=
    metrics.absoluteLoc?.added?.workspace ?? 0;
  aggregate.absoluteLoc.removed.upstream +=
    metrics.absoluteLoc?.removed?.upstream ?? 0;
  aggregate.absoluteLoc.removed.workspace +=
    metrics.absoluteLoc?.removed?.workspace ?? 0;
  if (Array.isArray(metrics.byLanguage)) {
    aggregate.byLanguage.push(...metrics.byLanguage);
  }
  if (Array.isArray(metrics.byFile)) {
    aggregate.byFile.push(
      ...metrics.byFile.map((file) => ({ ...file, repoId })),
    );
  }
}

const REPO_CALC_TIMEOUT_MS = 120000;

export async function handleRefreshImpact(
  options: HandleRefreshImpactOptions,
): Promise<void> {
  const {
    sessionId,
    calculatingSessions,
    sendToRequester,
    broadcast,
    findSessionById,
    calculateImpact,
    repoId,
    now = () => new Date().toISOString(),
  } = options;

  if (calculatingSessions.has(sessionId)) {
    logger.debug(
      `[impact] refresh requested while already calculating: ${sessionId}`,
    );
    sendToRequester({
      type: "impact_calculating",
      sessionId,
      timestamp: now(),
    });
    return;
  }

  logger.debug(
    `[impact] refresh start: ${sessionId} repoId=${repoId ?? "all"}`,
  );
  const refreshStart = Date.now();

  const session = await findSessionById(sessionId);
  if (!session) {
    sendToRequester({
      type: "impact_error",
      sessionId,
      error: "Session not found",
      timestamp: now(),
    });
    return;
  }

  calculatingSessions.add(sessionId);
  broadcast(sessionId, {
    type: "impact_calculating",
    sessionId,
    timestamp: now(),
  });

  try {
    const sessionRepos = session.repos ?? [];
    const targetRepos = repoId
      ? sessionRepos.filter((repo) => repo.projectRepoId === repoId)
      : sessionRepos;

    if (targetRepos.length > 0) {
      const perRepo: Array<Record<string, unknown>> = [];
      const aggregate = emptyAggregate();
      let firstTrends: ImpactTrend | undefined;
      const repoErrors: Array<{ repoId: string; error: string }> = [];

      for (const repo of targetRepos) {
        // A single failing (or hung) repo must not wedge the whole run: race
        // a watchdog and isolate errors per repo so the remaining repos still
        // produce an aggregate impact_updated broadcast.
        logger.debug(
          `[impact] repo calc start: ${sessionId}/${repo.projectRepoId} upstream=${repo.upstreamPath} workspace=${repo.workspacePath}`,
        );
        const repoStart = Date.now();
        let result: RefreshResult | null = null;
        try {
          result = await Promise.race([
            calculateImpact(
              sessionId,
              repo.upstreamPath,
              repo.workspacePath,
              true,
              repo.projectRepoId,
            ),
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `Impact calculation timed out for repo ${repo.projectRepoId}`,
                    ),
                  ),
                REPO_CALC_TIMEOUT_MS,
              ),
            ),
          ]);
        } catch (error) {
          logger.error(
            `[impact] repo calc failed: ${sessionId}/${repo.projectRepoId} after ${Date.now() - repoStart}ms:`,
            error,
          );
          repoErrors.push({
            repoId: repo.projectRepoId,
            error: error instanceof Error ? error.message : String(error),
          });
          continue;
        }
        if (!result) continue;
        logger.debug(
          `[impact] repo calc done: ${sessionId}/${repo.projectRepoId} in ${Date.now() - repoStart}ms`,
        );
        firstTrends = firstTrends ?? result.trends;
        perRepo.push({
          repoId: repo.projectRepoId,
          metrics: result.metrics,
        });
        accumulateMetrics(aggregate, result.metrics, repo.projectRepoId);
      }

      broadcast(sessionId, {
        type: "impact_updated",
        sessionId,
        repoId: repoId ?? null,
        metrics: aggregate,
        trends: firstTrends ?? null,
        repos: perRepo,
        ...(repoErrors.length > 0 && { repoErrors }),
        stale: false,
        timestamp: now(),
      });
      logger.debug(
        `[impact] refresh done: ${sessionId} in ${Date.now() - refreshStart}ms repos=${perRepo.length} errors=${repoErrors.length}`,
      );
      return;
    }

    if (repoId) {
      broadcast(sessionId, {
        type: "impact_error",
        sessionId,
        error: "Repository not found",
        timestamp: now(),
      });
      return;
    }

    const result = await calculateImpact(
      sessionId,
      session.upstreamPath,
      session.agentWorkspacePath,
      true,
    );

    broadcast(sessionId, {
      type: "impact_updated",
      sessionId,
      repoId: repoId ?? null,
      metrics: result.metrics,
      trends: result.trends,
      stale: false,
      timestamp: now(),
    });
  } catch (error) {
    logger.error(
      `[impact] refresh failed: ${sessionId} after ${Date.now() - refreshStart}ms:`,
      error,
    );
    broadcast(sessionId, {
      type: "impact_error",
      sessionId,
      repoId: repoId ?? null,
      error: error instanceof Error ? error.message : String(error),
      timestamp: now(),
    });
  } finally {
    calculatingSessions.delete(sessionId);
  }
}
