import { beforeEach, describe, expect, it } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dump, load } from "js-yaml";
import { migrateInlineToManagedRepos } from "../scripts/migrate-inline-to-managed-repos.ts";

describe("migrate-inline-to-managed-repos script", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mimo-managed-repo-migration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    rmSync(testHome, { recursive: true, force: true });
  });

  async function createInlineProject(ctx: any, overrides: any = {}) {
    const project = await ctx.repos.projects.create({
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/test/inline",
          repoType: "git",
          mountPath: ".",
        },
      ],

      name: "Inline Project",
      owner: "owner",
      ...overrides,
    });
    const yamlPath = join(testHome, "projects", project.id, "project.yaml");
    const data = load(readFileSync(yamlPath, "utf-8")) as any;
    data.repositories = [
      {
        id: "backend",
        name: "backend",
        repoUrl: "https://github.com/test/backend",
        repoType: "git",
        sourceBranch: "main",
        mountPath: "backend",
        primary: true,
      },
      {
        id: "frontend",
        name: "frontend",
        repoUrl: "https://github.com/test/frontend",
        repoType: "git",
        mountPath: "frontend",
      },
    ];
    writeFileSync(yamlPath, dump(data), "utf-8");
    return { project, yamlPath };
  }

  it("converts inline entries to managed repositories and rewrites references", async () => {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key" },
    });
    await ctx.repos.credentials.create({
      name: "cred",
      type: "https",
      username: "u",
      password: "p",
      owner: "owner",
    });
    const creds = await ctx.repos.credentials.findByOwner("owner");
    const { yamlPath } = await createInlineProject(ctx);
    // Point the inline entry at the real credential id
    const data = load(readFileSync(yamlPath, "utf-8")) as any;
    data.repositories[0].credentialId = creds[0].id;
    data.repositories[0].clonePort = 2222;
    writeFileSync(yamlPath, dump(data), "utf-8");

    const result = migrateInlineToManagedRepos(testHome);
    expect(result.errors).toEqual([]);
    expect(result.projectsMigrated).toBe(1);
    expect(result.repositoriesCreated).toBe(2);
    expect(result.backupsCreated).toBe(1);
    expect(existsSync(`${yamlPath}.bak`)).toBe(true);

    const managed = await ctx.repos.managedRepositories.findByOwner("owner");
    expect(managed).toHaveLength(2);
    const backend = managed.find((r: any) => r.name === "backend");
    expect(backend.repoUrl).toBe("https://github.com/test/backend");
    expect(backend.credentialId).toBe(creds[0].id);
    expect(backend.clonePort).toBe(2222);

    const migrated = load(readFileSync(yamlPath, "utf-8")) as any;
    expect(migrated.repositories).toHaveLength(2);
    expect(migrated.repositories[0]).toMatchObject({
      id: "backend",
      name: "backend",
      repoId: backend.id,
      sourceBranch: "main",
      mountPath: "backend",
      primary: true,
    });
    expect(migrated.repositories[0].repoUrl).toBeUndefined();
    expect(migrated.repositories[0].credentialId).toBeUndefined();
    expect(migrated.repositories[0].clonePort).toBeUndefined();
    expect(migrated.repositories[1].repoId).toBe(
      managed.find((r: any) => r.name === "frontend").id,
    );
  });

  it("is idempotent and skips projects already using references", async () => {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key" },
    });
    await createInlineProject(ctx);

    const first = migrateInlineToManagedRepos(testHome);
    expect(first.projectsMigrated).toBe(1);
    expect(first.repositoriesCreated).toBe(2);

    const second = migrateInlineToManagedRepos(testHome);
    expect(second.projectsMigrated).toBe(0);
    expect(second.projectsSkipped).toBe(1);
    expect(second.repositoriesCreated).toBe(0);
    expect(second.errors).toEqual([]);

    const managed = await ctx.repos.managedRepositories.findByOwner("owner");
    expect(managed).toHaveLength(2);
  });

  it("reports an error when an inline entry references a missing credential", async () => {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key" },
    });
    const { yamlPath } = await createInlineProject(ctx);
    const data = load(readFileSync(yamlPath, "utf-8")) as any;
    data.repositories[0].credentialId = "cred-1";
    writeFileSync(yamlPath, dump(data), "utf-8");

    const result = migrateInlineToManagedRepos(testHome);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("cred-1");
    expect(result.projectsMigrated).toBe(0);
  });

  it("restores from backup to recover the pre-migration state", async () => {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key" },
    });
    const { yamlPath } = await createInlineProject(ctx);
    const before = readFileSync(yamlPath, "utf-8");

    migrateInlineToManagedRepos(testHome);
    copyFileSync(`${yamlPath}.bak`, yamlPath);

    expect(readFileSync(yamlPath, "utf-8")).toBe(before);
  });

  it("supports dry-run without writing changes", async () => {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key" },
    });
    const { yamlPath } = await createInlineProject(ctx);
    const before = readFileSync(yamlPath, "utf-8");

    const result = migrateInlineToManagedRepos(testHome, { dryRun: true });
    expect(result.projectsMigrated).toBe(1);
    expect(result.repositoriesCreated).toBe(2);
    expect(readFileSync(yamlPath, "utf-8")).toBe(before);
    expect(existsSync(`${yamlPath}.bak`)).toBe(false);
    const managed = await ctx.repos.managedRepositories.findByOwner("owner");
    expect(managed).toHaveLength(0);
  });
});
