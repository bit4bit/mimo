import type { ImpactMetrics, ImpactTrend } from "./calculator.js";

interface SessionPaths {
  id: string;
  upstreamPath: string;
  agentWorkspacePath: string;
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
  ) => Promise<RefreshResult>;
  now?: () => string;
}

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
    now = () => new Date().toISOString(),
  } = options;

  if (calculatingSessions.has(sessionId)) {
    sendToRequester({
      type: "impact_calculating",
      sessionId,
      timestamp: now(),
    });
    return;
  }

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
    const result = await calculateImpact(
      sessionId,
      session.upstreamPath,
      session.agentWorkspacePath,
      true,
    );

    broadcast(sessionId, {
      type: "impact_updated",
      sessionId,
      metrics: result.metrics,
      trends: result.trends,
      stale: false,
      timestamp: now(),
    });
  } catch (error) {
    broadcast(sessionId, {
      type: "impact_error",
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: now(),
    });
  } finally {
    calculatingSessions.delete(sessionId);
  }
}
