import { describe, it, expect } from "bun:test";
import { createProjectDeletionUseCase } from "../src/domain/projects/project-deletion.js";

function makeSession(overrides: Partial<any> = {}): any {
  return {
    id: "session-1",
    projectId: "project-1",
    assignedAgentId: undefined,
    chatThreads: [],
    mcpToken: "token-1",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<any> = {}) {
  const calls = {
    sessionDelete: [] as string[],
    pinnedRemove: [] as { username: string; sessionId: string }[],
    vcsClear: [] as { projectId: string; repoType: string }[],
    projectDelete: [] as string[],
    sessionsListed: [] as string[],
  };

  const sessions = overrides.sessions ?? [makeSession()];

  return {
    deps: {
      sessions: {
        listByProject: async (projectId: string) => {
          calls.sessionsListed.push(projectId);
          return sessions;
        },
      },
      sessionDeletion: {
        deleteSessionByRecord: async (session: any) => {
          calls.sessionDelete.push(session.id);
        },
      },
      pinnedSessions: {
        remove: async (username: string, sessionId: string) => {
          calls.pinnedRemove.push({ username, sessionId });
        },
      },
      projectVcsCache: {
        clear: async (projectId: string, repoType: string) => {
          calls.vcsClear.push({ projectId, repoType });
        },
      },
      projects: {
        delete: async (id: string) => {
          calls.projectDelete.push(id);
        },
      },
    },
    calls,
  };
}

describe("project deletion cascade", () => {
  it("lists the project's sessions and deletes each via deleteSessionByRecord", async () => {
    const sessions = [
      makeSession({ id: "s1", mcpToken: "t1" }),
      makeSession({ id: "s2", mcpToken: "t2" }),
    ];
    const { deps, calls } = makeDeps({ sessions });
    const useCase = createProjectDeletionUseCase(deps);

    await useCase.deleteProjectCascade({ id: "p1", owner: "alice" });

    expect(calls.sessionsListed).toEqual(["p1"]);
    expect(calls.sessionDelete.sort()).toEqual(["s1", "s2"]);
  });

  it("clears both git and fossil VCS cache then deletes the project directory", async () => {
    const { deps, calls } = makeDeps();
    const useCase = createProjectDeletionUseCase(deps);

    await useCase.deleteProjectCascade({ id: "p1", owner: "alice" });

    expect(calls.vcsClear).toEqual([
      { projectId: "p1", repoType: "git" },
      { projectId: "p1", repoType: "fossil" },
    ]);
    expect(calls.projectDelete).toEqual(["p1"]);
  });

  it("removes the owner's pinned-session reference for each deleted session", async () => {
    const sessions = [makeSession({ id: "s1" }), makeSession({ id: "s2" })];
    const { deps, calls } = makeDeps({ sessions });
    const useCase = createProjectDeletionUseCase(deps);

    await useCase.deleteProjectCascade({ id: "p1", owner: "alice" });

    expect(calls.pinnedRemove).toEqual([
      { username: "alice", sessionId: "s1" },
      { username: "alice", sessionId: "s2" },
    ]);
  });

  it("notifies agents for each session via deleteSessionByRecord", async () => {
    const notified: Array<{ sessionId: string; agentId: string }> = [];
    const sessions = [
      makeSession({ id: "s1", assignedAgentId: "agent-a" }),
      makeSession({
        id: "s2",
        assignedAgentId: undefined,
        chatThreads: [{ id: "t1", assignedAgentId: "agent-b" } as any],
      }),
    ];
    const { deps } = makeDeps({ sessions });
    deps.sessionDeletion = {
      deleteSessionByRecord: async (session: any) => {
        const agentIds = new Set<string>();
        if (session.assignedAgentId) agentIds.add(session.assignedAgentId);
        for (const thread of session.chatThreads ?? []) {
          if (thread.assignedAgentId) agentIds.add(thread.assignedAgentId);
        }
        for (const agentId of agentIds) {
          notified.push({ sessionId: session.id, agentId });
        }
      },
    };
    const useCase = createProjectDeletionUseCase(deps);

    await useCase.deleteProjectCascade({ id: "p1", owner: "alice" });

    expect(notified.sort((a, b) => a.agentId.localeCompare(b.agentId))).toEqual(
      [
        { sessionId: "s1", agentId: "agent-a" },
        { sessionId: "s2", agentId: "agent-b" },
      ],
    );
  });

  it("deletes project and VCS cache even with zero sessions", async () => {
    const { deps, calls } = makeDeps({ sessions: [] });
    const useCase = createProjectDeletionUseCase(deps);

    await useCase.deleteProjectCascade({ id: "p1", owner: "alice" });

    expect(calls.sessionDelete).toEqual([]);
    expect(calls.pinnedRemove).toEqual([]);
    expect(calls.vcsClear).toEqual([
      { projectId: "p1", repoType: "git" },
      { projectId: "p1", repoType: "fossil" },
    ]);
    expect(calls.projectDelete).toEqual(["p1"]);
  });

  it("continues deleting remaining sessions when one fails", async () => {
    const sessions = [
      makeSession({ id: "s-bad" }),
      makeSession({ id: "s-good" }),
    ];
    const { deps, calls } = makeDeps({ sessions });
    deps.sessionDeletion = {
      deleteSessionByRecord: async (session: any) => {
        if (session.id === "s-bad") {
          throw new Error("corrupt YAML");
        }
        calls.sessionDelete.push(session.id);
      },
    };
    const useCase = createProjectDeletionUseCase(deps);

    await useCase.deleteProjectCascade({ id: "p1", owner: "alice" });

    expect(calls.sessionDelete).toEqual(["s-good"]);
    expect(calls.vcsClear).toHaveLength(2);
    expect(calls.projectDelete).toEqual(["p1"]);
  });

  it("does not remove pinned references for other owners' sessions", async () => {
    const { deps, calls } = makeDeps({ sessions: [makeSession()] });
    const useCase = createProjectDeletionUseCase(deps);

    await useCase.deleteProjectCascade({ id: "p1", owner: "alice" });

    expect(calls.pinnedRemove.every((r) => r.username === "alice")).toBe(true);
  });
});
