import { describe, it, expect } from "bun:test";
import {
  sweepExpiredInactiveSessions,
  type SessionDeletionLike,
} from "../src/domain/sessions/session-retention-sweeper.js";

describe("Session retention sweeper", () => {
  it("deletes expired and inactive sessions", async () => {
    const deletedIds: string[] = [];
    const now = new Date("2026-04-20T10:00:00.000Z");

    const sessionRepository = {
      listAll: async () => [
        {
          id: "expired-inactive",
          projectId: "project-1",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          sessionTtlDays: 180,
          lastActivityAt: "2026-04-20T09:00:00.000Z",
        },
      ],
    };

    const sessionDeletion: SessionDeletionLike = {
      deleteSessionByRecord: async (session) => {
        deletedIds.push(session.id);
      },
    };

    const result = await sweepExpiredInactiveSessions({
      sessionRepository,
      sessionDeletion,
      now: () => now,
    });

    expect(result.checked).toBe(1);
    expect(result.deleted).toBe(1);
    expect(deletedIds).toEqual(["expired-inactive"]);
  });

  it("skips expired but active sessions", async () => {
    const deletedIds: string[] = [];
    const now = new Date("2026-04-20T10:00:00.000Z");

    const sessionRepository = {
      listAll: async () => [
        {
          id: "expired-active",
          projectId: "project-1",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          sessionTtlDays: 180,
          lastActivityAt: "2026-04-20T09:55:00.000Z",
        },
      ],
    };

    const sessionDeletion: SessionDeletionLike = {
      deleteSessionByRecord: async (session) => {
        deletedIds.push(session.id);
      },
    };

    const result = await sweepExpiredInactiveSessions({
      sessionRepository,
      sessionDeletion,
      now: () => now,
    });

    expect(result.checked).toBe(1);
    expect(result.deleted).toBe(0);
    expect(deletedIds).toEqual([]);
  });
});

describe("persistent-terminals: TTL veto for active terminals", () => {
  const now = new Date("2026-04-20T10:00:00.000Z");
  const expiredBase = {
    projectId: "project-1",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    sessionTtlDays: 180,
    lastActivityAt: "2026-04-20T09:00:00.000Z",
  };

  function makeHarness(sessions: any[]) {
    const deletedIds: string[] = [];
    const sessionRepository = { listAll: async () => sessions };
    const sessionDeletion: SessionDeletionLike = {
      deleteSessionByRecord: async (session) => {
        deletedIds.push(session.id);
      },
    };
    return { deletedIds, sessionRepository, sessionDeletion };
  }

  it("skips expired inactive sessions that have an active terminal", async () => {
    const { deletedIds, sessionRepository, sessionDeletion } = makeHarness([
      {
        id: "expired-with-live-terminal",
        ...expiredBase,
        terminals: [{ id: "t1", state: "active" }],
      },
    ]);

    const result = await sweepExpiredInactiveSessions({
      sessionRepository,
      sessionDeletion,
      now: () => now,
    });

    expect(result.checked).toBe(1);
    expect(result.deleted).toBe(0);
    expect(deletedIds).toEqual([]);
  });

  it("deletes expired inactive sessions whose terminals are all dead", async () => {
    const { deletedIds, sessionRepository, sessionDeletion } = makeHarness([
      {
        id: "expired-with-dead-terminal",
        ...expiredBase,
        terminals: [{ id: "t1", state: "dead" }],
      },
    ]);

    const result = await sweepExpiredInactiveSessions({
      sessionRepository,
      sessionDeletion,
      now: () => now,
    });

    expect(result.deleted).toBe(1);
    expect(deletedIds).toEqual(["expired-with-dead-terminal"]);
  });
});
