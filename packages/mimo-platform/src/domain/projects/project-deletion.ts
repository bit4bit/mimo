// SPDX-License-Identifier: AGPL-3.0-only
import type { Session } from "../sessions/repository.js";
import type { SessionDeletionLike } from "../sessions/session-deletion.js";

interface SessionsRepositoryLike {
  listByProject(projectId: string): Promise<Session[]>;
}

interface PinnedSessionsRepositoryLike {
  remove(username: string, sessionId: string): Promise<unknown>;
}

interface ProjectVcsCacheLike {
  clear(
    projectId: string,
    repoType: "git" | "fossil",
    repoId?: string,
  ): Promise<void>;
}

interface ProjectsRepositoryLike {
  delete(id: string): Promise<void>;
}

export interface ProjectDeletionDeps {
  sessions: SessionsRepositoryLike;
  sessionDeletion: SessionDeletionLike;
  pinnedSessions: PinnedSessionsRepositoryLike;
  projectVcsCache: ProjectVcsCacheLike;
  projects: ProjectsRepositoryLike;
}

export interface ProjectDeletionLike {
  deleteProjectCascade(project: { id: string; owner: string }): Promise<void>;
}

export function createProjectDeletionUseCase(
  deps: ProjectDeletionDeps,
): ProjectDeletionLike {
  return {
    async deleteProjectCascade(project: {
      id: string;
      owner: string;
    }): Promise<void> {
      const sessions = await deps.sessions.listByProject(project.id);

      for (const session of sessions) {
        try {
          await deps.sessionDeletion.deleteSessionByRecord({
            id: session.id,
            projectId: session.projectId,
            assignedAgentId: session.assignedAgentId,
            chatThreads: session.chatThreads,
            mcpToken: session.mcpToken,
          });
          await deps.pinnedSessions.remove(project.owner, session.id);
        } catch (error) {
          console.error(
            `[project-deletion] Failed to delete session ${session.id} of project ${project.id}:`,
            error,
          );
        }
      }

      await deps.projectVcsCache.clear(project.id, "git");
      await deps.projectVcsCache.clear(project.id, "fossil");
      await deps.projects.delete(project.id);
    },
  };
}
