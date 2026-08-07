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

  it("stores the explicit group passed to add", async () => {
    const repo = makeRepo();
    const u = nextUser();
    const after = await repo.add(u, {
      sessionId: "s1",
      projectId: "p1",
      group: "client-x",
    });
    expect(after[0]!.group).toBe("client-x");
  });

  it("defaults the group to 'Ungrouped' when add omits it", async () => {
    const repo = makeRepo();
    const u = nextUser();
    const after = await repo.add(u, { sessionId: "s1", projectId: "p1" });
    expect(after[0]!.group).toBe("Ungrouped");
  });

  it("allows the same session in two different groups as two entries", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, {
      sessionId: "s1",
      projectId: "p1",
      group: "client-x",
    });
    await repo.add(u, {
      sessionId: "s1",
      projectId: "p1",
      group: "docs",
    });
    const list = await repo.list(u);
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.group).sort()).toEqual(["client-x", "docs"]);
  });

  it("deduplicates on (sessionId, group), moving the entry to the front", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, {
      sessionId: "s1",
      projectId: "p1",
      group: "client-x",
    });
    await repo.add(u, {
      sessionId: "s2",
      projectId: "p1",
      group: "client-x",
    });
    await repo.add(u, {
      sessionId: "s3",
      projectId: "p1",
      group: "client-x",
    });
    // Re-pin s3 under the same group: must not duplicate, must move to front.
    const after = await repo.add(u, {
      sessionId: "s3",
      projectId: "p1",
      group: "client-x",
    });
    expect(after).toHaveLength(3);
    expect(after[0]).toMatchObject({ sessionId: "s3", group: "client-x" });
    expect(after[1]).toMatchObject({ sessionId: "s2", group: "client-x" });
    expect(after[2]).toMatchObject({ sessionId: "s1", group: "client-x" });
  });

  it("creating a new (sessionId, group) for an existing sessionId leaves the other rows alone", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, {
      sessionId: "s1",
      projectId: "p1",
      group: "client-x",
    });
    await repo.add(u, {
      sessionId: "s2",
      projectId: "p1",
      group: "client-x",
    });
    await repo.add(u, {
      sessionId: "s3",
      projectId: "p1",
      group: "docs",
    });
    // Re-pin s3 under client-x (a new group for s3): adds a fourth row, leaves
    // the s3:docs row untouched.
    const after = await repo.add(u, {
      sessionId: "s3",
      projectId: "p1",
      group: "client-x",
    });
    expect(after).toHaveLength(4);
    expect(after[0]).toMatchObject({ sessionId: "s3", group: "client-x" });
    const docsEntry = after.find(
      (e) => e.sessionId === "s3" && e.group === "docs",
    );
    expect(docsEntry).toBeDefined();
  });

  it("counts the global 5-entry cap across all groups", async () => {
    const repo = makeRepo();
    const u = nextUser();
    // 2 in client-x, 2 in docs, 1 in spike: fills the cap.
    for (const [i, group] of [
      ["s1", "client-x"],
      ["s2", "client-x"],
      ["s3", "docs"],
      ["s4", "docs"],
      ["s5", "spike"],
    ] as const) {
      await repo.add(u, { sessionId: i, projectId: "p1", group });
    }
    try {
      await repo.add(u, {
        sessionId: "s6",
        projectId: "p1",
        group: "client-x",
      });
      throw new Error("expected PinLimitReachedError");
    } catch (err) {
      expect(err).toBeInstanceOf(PinLimitReachedError);
      expect((err as PinLimitReachedError).limit).toBe(5);
    }
    expect(await repo.list(u)).toHaveLength(5);
  });

  it("listByGroup returns only entries matching the group (case-insensitive)", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, { sessionId: "s1", projectId: "p1", group: "client-x" });
    await repo.add(u, { sessionId: "s2", projectId: "p1", group: "client-x" });
    await repo.add(u, { sessionId: "s3", projectId: "p1", group: "docs" });
    const filtered = await repo.listByGroup(u, "Client-X");
    expect(filtered.map((e) => e.sessionId).sort()).toEqual(["s1", "s2"]);
  });

  it("removeByGroup removes only the matching (sessionId, group) when given a group", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, { sessionId: "s1", projectId: "p1", group: "client-x" });
    await repo.add(u, { sessionId: "s1", projectId: "p1", group: "docs" });
    const after = await repo.removeByGroup(u, "s1", "client-x");
    expect(after).toHaveLength(1);
    expect(after[0]!.group).toBe("docs");
  });

  it("removeByGroup removes all entries for a sessionId when no group is supplied", async () => {
    const repo = makeRepo();
    const u = nextUser();
    await repo.add(u, { sessionId: "s1", projectId: "p1", group: "client-x" });
    await repo.add(u, { sessionId: "s1", projectId: "p1", group: "docs" });
    await repo.add(u, { sessionId: "s2", projectId: "p1", group: "client-x" });
    const after = await repo.removeByGroup(u, "s1");
    expect(after).toHaveLength(1);
    expect(after[0]!.sessionId).toBe("s2");
  });

  it("coerces legacy entries missing the group field to 'Ungrouped' on read", async () => {
    const repo = makeRepo();
    const u = nextUser();
    // Write a YAML file manually without the `group` field.
    const legacy = `entries:\n  - sessionId: s1\n    projectId: p1\n  - sessionId: s2\n    projectId: p1\n`;
    const fs = mockOS.fs as any;
    const dir = mockOS.path.join("/tmp/test-pinned/users", u);
    await fs.mkdirAsync(dir, { recursive: true });
    const file = mockOS.path.join(dir, "pinned-sessions.yaml");
    await fs.writeFileAsync(file, legacy, { encoding: "utf-8" });

    const list = await repo.list(u);
    expect(list).toHaveLength(2);
    expect(list.every((e) => e.group === "Ungrouped")).toBe(true);

    // A subsequent write should persist the group field.
    await repo.add(u, { sessionId: "s3", projectId: "p1", group: "docs" });
    const reread = await fs.readFileAsync(file, "utf-8");
    expect(reread).toContain("group:");
    expect(reread).toContain("Ungrouped");
    expect(reread).toContain("docs");
  });
});
