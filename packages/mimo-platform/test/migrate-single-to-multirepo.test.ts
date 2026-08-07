import { beforeEach, describe, expect, it } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dump, load } from "js-yaml";
import { migrateSingleToMultiRepo } from "../scripts/migrate-single-to-multirepo.ts";

describe("migrate-single-to-multirepo script", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mimo-multirepo-migration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    rmSync(testHome, { recursive: true, force: true });
  });

  it("converts projects and sessions, creates backups, and is idempotent", async () => {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key" },
    });

    const project = await ctx.repos.projects.create({
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/test/legacy",
          repoType: "git",
          credentialId: "cred-1",
          sourceBranch: "main",
          mountPath: ".",
        },
      ],

      name: "Legacy Project",
      owner: "owner",
    });
    const session = await ctx.repos.sessions.create({
      name: "Legacy Session",
      projectId: project.id,
      owner: "owner",
      branchName: "main",
    });

    const projectYamlPath = join(
      testHome,
      "projects",
      project.id,
      "project.yaml",
    );
    const sessionYamlPath = join(
      testHome,
      "projects",
      project.id,
      "sessions",
      session.id,
      "session.yaml",
    );

    const legacyProjectData = load(
      readFileSync(projectYamlPath, "utf-8"),
    ) as any;
    delete legacyProjectData.repositories;
    // Simulate pre-multirepo YAML: flat fields instead of a repositories array
    legacyProjectData.repoUrl = "https://github.com/test/legacy";
    legacyProjectData.repoType = "git";
    legacyProjectData.credentialId = "cred-1";
    legacyProjectData.sourceBranch = "main";
    writeFileSync(projectYamlPath, dump(legacyProjectData), "utf-8");
    const legacySessionData = load(
      readFileSync(sessionYamlPath, "utf-8"),
    ) as any;
    delete legacySessionData.repos;
    writeFileSync(sessionYamlPath, dump(legacySessionData), "utf-8");
    const legacyBareRepo = join(testHome, "session-repos", `${session.id}.git`);
    mkdirSync(legacyBareRepo, { recursive: true });

    const first = migrateSingleToMultiRepo(testHome);
    expect(first.errors).toEqual([]);
    expect(first.projectsMigrated).toBe(1);
    expect(first.sessionsMigrated).toBe(1);
    expect(first.backupsCreated).toBe(2);

    expect(existsSync(`${projectYamlPath}.bak`)).toBe(true);
    expect(existsSync(`${sessionYamlPath}.bak`)).toBe(true);
    expect(existsSync(legacyBareRepo)).toBe(false);
    expect(
      existsSync(join(testHome, "session-repos", `${session.id}-default.git`)),
    ).toBe(true);

    const projectData = load(readFileSync(projectYamlPath, "utf-8")) as any;
    expect(projectData.repositories).toHaveLength(1);
    expect(projectData.repositories[0]).toMatchObject({
      id: "default",
      repoUrl: "https://github.com/test/legacy",
      repoType: "git",
      credentialId: "cred-1",
      sourceBranch: "main",
      mountPath: ".",
      primary: true,
    });

    const sessionData = load(readFileSync(sessionYamlPath, "utf-8")) as any;
    expect(sessionData.repos).toHaveLength(1);
    expect(sessionData.repos[0]).toMatchObject({
      projectRepoId: "default",
      upstreamPath: session.upstreamPath,
      workspacePath: session.agentWorkspacePath,
      branch: "main",
    });

    const second = migrateSingleToMultiRepo(testHome);
    expect(second.errors).toEqual([]);
    expect(second.projectsMigrated).toBe(0);
    expect(second.sessionsMigrated).toBe(0);
    expect(second.projectsSkipped).toBe(1);
    expect(second.sessionsSkipped).toBe(1);
  });

  it("reports validation errors without rewriting invalid files", async () => {
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key" },
    });

    const project = await ctx.repos.projects.create({
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/test/broken",
          repoType: "git",
          mountPath: ".",
        },
      ],

      name: "Broken Project",
      owner: "owner",
    });
    const session = await ctx.repos.sessions.create({
      name: "Broken Session",
      projectId: project.id,
      owner: "owner",
    });

    const projectYamlPath = join(
      testHome,
      "projects",
      project.id,
      "project.yaml",
    );
    const sessionYamlPath = join(
      testHome,
      "projects",
      project.id,
      "sessions",
      session.id,
      "session.yaml",
    );
    const projectData = load(readFileSync(projectYamlPath, "utf-8")) as any;
    delete projectData.repositories;
    delete projectData.repoUrl;
    writeFileSync(projectYamlPath, dump(projectData), "utf-8");
    const sessionData = load(readFileSync(sessionYamlPath, "utf-8")) as any;
    delete sessionData.repos;
    delete sessionData.upstreamPath;
    writeFileSync(sessionYamlPath, dump(sessionData), "utf-8");

    const result = migrateSingleToMultiRepo(testHome);
    expect(result.projectsMigrated).toBe(0);
    expect(result.sessionsMigrated).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("repoUrl");
    expect(result.errors[1]).toContain("upstreamPath");
    expect(existsSync(`${projectYamlPath}.bak`)).toBe(false);
    expect(existsSync(`${sessionYamlPath}.bak`)).toBe(false);
  });
});
