// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, beforeAll } from "bun:test";
import { createMockOS } from "../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../infrastructure/os/mock-adapter.js";
import {
  FilePinnedSessionsRepository,
  PinLimitReachedError,
  PIN_LIMIT,
} from "./repository.js";

describe("FilePinnedSessionsRepository", () => {
  let mockOS: MockOS;

  beforeAll(() => {
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-pinned",
        MIMO_INTERNAL_VCS_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;
    mockOS.fs.seed({
      "/tmp/test-pinned": null,
      "/tmp/test-pinned/users": null,
    });
  });

  function makeRepo(limit: number = PIN_LIMIT) {
    return new FilePinnedSessionsRepository({
      os: mockOS,
      usersPath: "/tmp/test-pinned/users",
      limit,
    });
  }

  // Each test uses a unique username so state does not leak between cases.
  let counter = 0;
  function nextUser(): string {
    counter += 1;
    return `user_${counter}`;
  }

  it("returns an empty list when no pin file exists", async () => {
    const repo = makeRepo();
    expect(await repo.list(nextUser())).toEqual([]);
  });

  it("adds entries to the front", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, { sessionId: "s1", projectId: "p1" });
    const after = await repo.add(u, { sessionId: "s2", projectId: "p1" });
    expect(after.map((e) => e.sessionId)).toEqual(["s2", "s1"]);
  });

  it("rejects with pin_limit_reached when adding a 6th entry", async () => {
    const repo = makeRepo();
    const u = nextUser();
    for (let i = 1; i <= 5; i++) {
      await repo.add(u, { sessionId: `s${i}`, projectId: "p1" });
    }
    try {
      await repo.add(u, { sessionId: "s6", projectId: "p1" });
      throw new Error("expected PinLimitReachedError");
    } catch (err) {
      expect(err).toBeInstanceOf(PinLimitReachedError);
      expect((err as PinLimitReachedError).limit).toBe(5);
      expect((err as PinLimitReachedError).message).toBe(
        "Pin limit reached (5)",
      );
    }
    const list = await repo.list(u);
    expect(list).toHaveLength(5);
    expect(list.some((e) => e.sessionId === "s6")).toBe(false);
  });

  it("moves an already-pinned session to the front (no duplicate)", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, { sessionId: "s1", projectId: "p1" });
    await repo.add(u, { sessionId: "s2", projectId: "p1" });
    await repo.add(u, { sessionId: "s3", projectId: "p1" });
    const after = await repo.add(u, { sessionId: "s1", projectId: "p1" });
    expect(after.map((e) => e.sessionId)).toEqual(["s1", "s3", "s2"]);
    expect(after).toHaveLength(3);
  });

  it("removes a pin (no-op on missing)", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, { sessionId: "s1", projectId: "p1" });
    await repo.add(u, { sessionId: "s2", projectId: "p1" });
    const after = await repo.remove(u, "s1");
    expect(after.map((e) => e.sessionId)).toEqual(["s2"]);
    const noOp = await repo.remove(u, "missing");
    expect(noOp.map((e) => e.sessionId)).toEqual(["s2"]);
  });

  it("reorders the list by sessionId", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, { sessionId: "s1", projectId: "p1" });
    await repo.add(u, { sessionId: "s2", projectId: "p1" });
    await repo.add(u, { sessionId: "s3", projectId: "p1" });
    const reordered = await repo.reorder(u, ["s2", "s1", "s3"]);
    expect(reordered.map((e) => e.sessionId)).toEqual(["s2", "s1", "s3"]);
  });

  it("rejects reorder when order set does not match current pins", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, { sessionId: "s1", projectId: "p1" });
    try {
      await repo.reorder(u, ["s1", "s2"]);
      throw new Error("expected reorder to throw");
    } catch (err) {
      expect((err as Error).message).toMatch(/does not match/);
    }
  });

  it("persists pins across new repository instances", async () => {
    const repo1 = makeRepo();
    const u = nextUser();
    await repo1.add(u, { sessionId: "s1", projectId: "p1" });
    await repo1.add(u, { sessionId: "s2", projectId: "p1" });

    const repo2 = makeRepo();
    const list = await repo2.list(u);
    expect(list.map((e) => e.sessionId)).toEqual(["s2", "s1"]);
  });

  it("keeps each user's pin store isolated", async () => {
    const repo = makeRepo();
    const alice = nextUser();
    const bob = nextUser();
    await repo.add(alice, { sessionId: "a1", projectId: "p1" });
    await repo.add(bob, { sessionId: "b1", projectId: "p2" });
    expect((await repo.list(alice)).map((e) => e.sessionId)).toEqual(["a1"]);
    expect((await repo.list(bob)).map((e) => e.sessionId)).toEqual(["b1"]);
  });
});