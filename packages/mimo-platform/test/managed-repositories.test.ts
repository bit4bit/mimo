import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmdirSync, existsSync } from "fs";
import { join } from "path";

describe("Managed Repositories", () => {
  let ctx: any;
  let managedRepositories: any;
  const testUser = "testuser-repositories";
  let repositoriesDir: string;

  beforeEach(async () => {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context");
    ctx = createMimoContext({
      env: { MIMO_HOME: "/tmp/test-mimo-repositories" },
    });
    managedRepositories = ctx.repos.managedRepositories;
    repositoriesDir = join(ctx.paths.users, testUser, "repositories");
    if (existsSync(repositoriesDir)) {
      rmdirSync(repositoriesDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(repositoriesDir)) {
      rmdirSync(repositoriesDir, { recursive: true });
    }
  });

  describe("Managed Repository model", () => {
    it("should create a repository with url, type, credential and port", async () => {
      const repo = await managedRepositories.create({
        name: "backend",
        repoUrl: "https://github.com/user/backend.git",
        repoType: "git",
        credentialId: "cred-1",
        clonePort: 2222,
        owner: testUser,
      });

      expect(repo.id).toBeDefined();
      expect(repo.name).toBe("backend");
      expect(repo.repoUrl).toBe("https://github.com/user/backend.git");
      expect(repo.repoType).toBe("git");
      expect(repo.credentialId).toBe("cred-1");
      expect(repo.clonePort).toBe(2222);
      expect(repo.owner).toBe(testUser);
      expect(repo.createdAt).toBeInstanceOf(Date);
    });

    it("should require a name", async () => {
      await expect(
        managedRepositories.create({
          name: "  ",
          repoUrl: "https://github.com/user/backend.git",
          repoType: "git",
          owner: testUser,
        }),
      ).rejects.toThrow("Repository name is required");
    });

    it("should require a repoUrl", async () => {
      await expect(
        managedRepositories.create({
          name: "backend",
          repoUrl: "",
          repoType: "git",
          owner: testUser,
        }),
      ).rejects.toThrow("Repository URL is required");
    });

    it("should find a repository by id scoped to owner", async () => {
      const created = await managedRepositories.create({
        name: "backend",
        repoUrl: "https://github.com/user/backend.git",
        repoType: "git",
        owner: testUser,
      });

      const found = await managedRepositories.findById(created.id, testUser);
      expect(found?.id).toBe(created.id);

      const otherUser = await managedRepositories.findById(
        created.id,
        "someone-else",
      );
      expect(otherUser).toBeNull();
    });

    it("should list repositories by owner", async () => {
      await managedRepositories.create({
        name: "a",
        repoUrl: "https://github.com/user/a.git",
        repoType: "git",
        owner: testUser,
      });
      await managedRepositories.create({
        name: "b",
        repoUrl: "https://github.com/user/b.git",
        repoType: "fossil",
        owner: testUser,
      });

      const repos = await managedRepositories.findByOwner(testUser);
      expect(repos).toHaveLength(2);
    });

    it("should update repository fields and allow clearing credential", async () => {
      const created = await managedRepositories.create({
        name: "backend",
        repoUrl: "https://github.com/user/backend.git",
        repoType: "git",
        credentialId: "cred-1",
        clonePort: 2222,
        owner: testUser,
      });

      const updated = await managedRepositories.update(created.id, testUser, {
        repoUrl: "https://github.com/user/backend-v2.git",
        credentialId: null,
        clonePort: null,
      });

      expect(updated.repoUrl).toBe("https://github.com/user/backend-v2.git");
      expect(updated.credentialId).toBeUndefined();
      expect(updated.clonePort).toBeUndefined();
    });

    it("should delete a repository", async () => {
      const created = await managedRepositories.create({
        name: "backend",
        repoUrl: "https://github.com/user/backend.git",
        repoType: "git",
        owner: testUser,
      });

      await managedRepositories.delete(created.id, testUser);
      expect(
        await managedRepositories.findById(created.id, testUser),
      ).toBeNull();
    });
  });

  describe("Name uniqueness per owner", () => {
    it("should reject duplicate names for the same owner on create", async () => {
      await managedRepositories.create({
        name: "backend",
        repoUrl: "https://github.com/user/backend.git",
        repoType: "git",
        owner: testUser,
      });

      await expect(
        managedRepositories.create({
          name: "backend",
          repoUrl: "https://github.com/user/other.git",
          repoType: "git",
          owner: testUser,
        }),
      ).rejects.toThrow(/already exists/);
    });

    it("should allow the same name for different owners", async () => {
      await managedRepositories.create({
        name: "backend",
        repoUrl: "https://github.com/user/backend.git",
        repoType: "git",
        owner: testUser,
      });

      const other = await managedRepositories.create({
        name: "backend",
        repoUrl: "https://github.com/user/backend.git",
        repoType: "git",
        owner: "other-user-repositories",
      });
      expect(other.id).toBeDefined();

      const otherDir = join(
        ctx.paths.users,
        "other-user-repositories",
        "repositories",
      );
      if (existsSync(otherDir)) {
        rmdirSync(otherDir, { recursive: true });
      }
    });

    it("should reject renaming to an existing name on update", async () => {
      await managedRepositories.create({
        name: "backend",
        repoUrl: "https://github.com/user/backend.git",
        repoType: "git",
        owner: testUser,
      });
      const second = await managedRepositories.create({
        name: "frontend",
        repoUrl: "https://github.com/user/frontend.git",
        repoType: "git",
        owner: testUser,
      });

      await expect(
        managedRepositories.update(second.id, testUser, { name: "backend" }),
      ).rejects.toThrow(/already exists/);
    });
  });
});
