import type { Session } from "./repository.js";

interface SessionRepositoryLike {
  delete(projectId: string, sessionId: string): Promise<void>;
}

interface SessionStateServiceLike {
  clearSessionState(sessionId: string): void;
}

interface FileSyncServiceLike {
  cleanupSession(sessionId: string): Promise<void>;
}

interface ImpactCalculatorLike {
  clearState(sessionId: string): void;
}

interface AgentServiceLike {
  notifySessionEnded(sessionId: string, agentId: string): Promise<void>;
}

export interface SessionDeletionLike {
  deleteSessionByRecord(session: Pick<Session, "id" | "projectId" | "assignedAgentId">): Promise<void>;
}

interface SessionDeletionDeps {
  sessionRepository: SessionRepositoryLike;
  sessionStateService: SessionStateServiceLike;
  fileSyncService: FileSyncServiceLike;
  impactCalculator: ImpactCalculatorLike;
  agentService: AgentServiceLike;
}

export function createSessionDeletionUseCase(
  deps: SessionDeletionDeps,
): SessionDeletionLike {
  return {
    async deleteSessionByRecord(
      session: Pick<Session, "id" | "projectId" | "assignedAgentId">,
    ): Promise<void> {
      await deps.sessionRepository.delete(session.projectId, session.id);
      deps.sessionStateService.clearSessionState(session.id);
      await deps.fileSyncService.cleanupSession(session.id);
      deps.impactCalculator.clearState(session.id);

      if (session.assignedAgentId) {
        await deps.agentService.notifySessionEnded(session.id, session.assignedAgentId);
      }
    },
  };
}
