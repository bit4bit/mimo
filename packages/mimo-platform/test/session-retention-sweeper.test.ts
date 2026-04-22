// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";
import {
  sweepExpiredInactiveSessions,
  type SessionDeletionLike,
} from "../src/sessions/session-retention-sweeper.js";

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
