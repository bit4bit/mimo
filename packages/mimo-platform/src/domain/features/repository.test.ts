// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, beforeAll } from "bun:test";
import { createMockOS } from "../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../infrastructure/os/mock-adapter.js";
import { FileFeatureRepository, type FeatureRepository } from "./repository.js";

describe("FileFeatureRepository", () => {
  let mockOS: MockOS;

  beforeAll(() => {
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-features",
        MIMO_INTERNAL_VCS_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;
    mockOS.fs.seed({
      "/tmp/test-features": null,
      "/tmp/test-features/projects": null,
    });
  });

  function makeRepo(): FeatureRepository {
    return new FileFeatureRepository({
      os: mockOS,
      projectsPath: "/tmp/test-features/projects",
    });
  }

  // Each test uses a unique project id so state does not leak between cases.
  let counter = 0;
  function nextProjectId(): string {
    counter += 1;
    return `proj_${counter}`;
  }

  it("returns an empty list when no features file exists", async () => {
    const repo = makeRepo();
    expect(await repo.list(nextProjectId())).toEqual([]);
  });

  it("adds a feature and returns it in the list with done=false", async () => {
    const repo = makeRepo();
    const projectId = nextProjectId();
    const added = await repo.add(projectId, {
      branchName: "dark-mode",
      description: "Add dark mode toggle",
    });
    expect(added.branchName).toBe("dark-mode");
    expect(added.description).toBe("Add dark mode toggle");
    expect(added.done).toBe(false);
    expect(typeof added.id).toBe("string");
    expect(added.id.length).toBeGreaterThan(0);
    expect(typeof added.createdAt).toBe("string");

    const list = await repo.list(projectId);
    expect(list).toHaveLength(1);
    expect(list[0]!.branchName).toBe("dark-mode");
    expect(list[0]!.done).toBe(false);
  });

  it("does not validate branch names (stores verbatim)", async () => {
    const repo = makeRepo();
    const projectId = nextProjectId();
    const added = await repo.add(projectId, {
      branchName: "WEIRD branch name!",
      description: "anything",
    });
    expect(added.branchName).toBe("WEIRD branch name!");
  });

  it("edits a feature's branchName and description", async () => {
    const repo = makeRepo();
    const projectId = nextProjectId();
    const added = await repo.add(projectId, {
      branchName: "old-branch",
      description: "old desc",
    });
    const edited = await repo.edit(projectId, added.id, {
      branchName: "new-branch",
      description: "new desc",
    });
    expect(edited).not.toBeNull();
    expect(edited!.branchName).toBe("new-branch");
    expect(edited!.description).toBe("new desc");
    // done flag is preserved on edit
    expect(edited!.done).toBe(false);

    const list = await repo.list(projectId);
    expect(list).toHaveLength(1);
    expect(list[0]!.branchName).toBe("new-branch");
  });

  it("returns null when editing a non-existent feature", async () => {
    const repo = makeRepo();
    const projectId = nextProjectId();
    const result = await repo.edit(projectId, "no-such-id", {
      branchName: "x",
    });
    expect(result).toBeNull();
  });

  it("deletes a feature from the list", async () => {
    const repo = makeRepo();
    const projectId = nextProjectId();
    const a = await repo.add(projectId, {
      branchName: "a",
      description: "a",
    });
    const b = await repo.add(projectId, {
      branchName: "b",
      description: "b",
    });
    const remaining = await repo.delete(projectId, a.id);
    expect(remaining.map((f) => f.id)).toEqual([b.id]);
    const list = await repo.list(projectId);
    expect(list).toHaveLength(1);
    expect(list[0]!.branchName).toBe("b");
  });

  it("delete is a no-op (returns current list) when the feature is missing", async () => {
    const repo = makeRepo();
    const projectId = nextProjectId();
    await repo.add(projectId, { branchName: "a", description: "a" });
    const remaining = await repo.delete(projectId, "no-such-id");
    expect(remaining).toHaveLength(1);
  });

  it("toggles done state from false to true", async () => {
    const repo = makeRepo();
    const projectId = nextProjectId();
    const added = await repo.add(projectId, {
      branchName: "feat",
      description: "desc",
    });
    const toggled = await repo.toggleDone(projectId, added.id);
    expect(toggled).not.toBeNull();
    expect(toggled!.done).toBe(true);
    const list = await repo.list(projectId);
    expect(list[0]!.done).toBe(true);
  });

  it("toggles done state from true back to false", async () => {
    const repo = makeRepo();
    const projectId = nextProjectId();
    const added = await repo.add(projectId, {
      branchName: "feat",
      description: "desc",
    });
    await repo.toggleDone(projectId, added.id);
    const toggled = await repo.toggleDone(projectId, added.id);
    expect(toggled!.done).toBe(false);
  });

  it("returns null when toggling a non-existent feature", async () => {
    const repo = makeRepo();
    const projectId = nextProjectId();
    const result = await repo.toggleDone(projectId, "no-such-id");
    expect(result).toBeNull();
  });

  it("persists features across new repository instances", async () => {
    const repo1 = makeRepo();
    const projectId = nextProjectId();
    await repo1.add(projectId, {
      branchName: "persist",
      description: "survives restart",
    });

    const repo2 = makeRepo();
    const list = await repo2.list(projectId);
    expect(list).toHaveLength(1);
    expect(list[0]!.branchName).toBe("persist");
  });

  it("keeps each project's feature list isolated", async () => {
    const repo = makeRepo();
    const p1 = nextProjectId();
    const p2 = nextProjectId();
    await repo.add(p1, { branchName: "p1-feat", description: "p1" });
    await repo.add(p2, { branchName: "p2-feat", description: "p2" });
    expect((await repo.list(p1)).map((f) => f.branchName)).toEqual(["p1-feat"]);
    expect((await repo.list(p2)).map((f) => f.branchName)).toEqual(["p2-feat"]);
  });

  it("stores features in <projectsPath>/<projectId>/features.json", async () => {
    const repo = makeRepo();
    const projectId = nextProjectId();
    await repo.add(projectId, {
      branchName: "file-check",
      description: "check the file path",
    });
    const filePath = mockOS.path.join(
      "/tmp/test-features/projects",
      projectId,
      "features.json",
    );
    expect(await mockOS.fs.existsAsync(filePath)).toBe(true);
    const content = await mockOS.fs.readFileAsync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].branchName).toBe("file-check");
  });
});
