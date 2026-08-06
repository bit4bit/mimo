#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Migration: single-repository project/session YAML -> multi-repository schema.
 *
 * Usage:
 *   bun scripts/migrate-single-to-multirepo.ts [--dry-run]
 */

import { homedir } from "os";
import { join } from "path";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "fs";
import { dump, load } from "js-yaml";

export interface MultiRepoMigrationResult {
  projectsMigrated: number;
  projectsSkipped: number;
  sessionsMigrated: number;
  sessionsSkipped: number;
  backupsCreated: number;
  errors: string[];
}

interface MigrationOptions {
  dryRun?: boolean;
  vcsReposDir?: string;
}

function backupOnce(path: string, result: MultiRepoMigrationResult): void {
  const backupPath = `${path}.bak`;
  if (!existsSync(backupPath)) {
    copyFileSync(path, backupPath);
    result.backupsCreated++;
  }
}

function migrateProjectFile(
  path: string,
  result: MultiRepoMigrationResult,
  options: MigrationOptions,
): void {
  const data = load(readFileSync(path, "utf-8")) as Record<string, any>;
  if (Array.isArray(data.repositories) && data.repositories.length > 0) {
    result.projectsSkipped++;
    return;
  }
  if (!data.repoUrl || !data.repoType) {
    result.errors.push(`${path}: missing repoUrl or repoType`);
    return;
  }

  const repositories = [
    {
      id: "default",
      name: data.name ?? "default",
      repoUrl: data.repoUrl,
      repoType: data.repoType,
      ...(data.credentialId && { credentialId: data.credentialId }),
      ...(data.sourceBranch && { sourceBranch: data.sourceBranch }),
      ...(data.newBranch && { newBranch: data.newBranch }),
      ...(data.clonePort != null && { clonePort: data.clonePort }),
      mountPath: ".",
      primary: true,
    },
  ];

  if (!options.dryRun) {
    backupOnce(path, result);
    writeFileSync(path, dump({ ...data, repositories }), "utf-8");
  }
  result.projectsMigrated++;
}

function migrateSessionFile(
  path: string,
  result: MultiRepoMigrationResult,
  options: MigrationOptions,
): void {
  const data = load(readFileSync(path, "utf-8")) as Record<string, any>;
  if (Array.isArray(data.repos) && data.repos.length > 0) {
    result.sessionsSkipped++;
    return;
  }
    if (!data.upstreamPath || !data.agentWorkspacePath) {
    result.errors.push(`${path}: missing upstreamPath or agentWorkspacePath`);
    return;
  }

  const repos = [
    {
      projectRepoId: "default",
      upstreamPath: data.upstreamPath,
      workspacePath: data.agentWorkspacePath,
      ...(data.branch && { branch: data.branch }),
      ...(data.baseline && { baseline: data.baseline }),
    },
  ];

  if (!options.dryRun) {
    backupOnce(path, result);
    writeFileSync(path, dump({ ...data, repos }), "utf-8");
    if (options.vcsReposDir && data.id) {
      const legacyRepo = join(options.vcsReposDir, `${data.id}.git`);
      const canonicalRepo = join(options.vcsReposDir, `${data.id}-default.git`);
      if (existsSync(legacyRepo) && !existsSync(canonicalRepo)) {
        renameSync(legacyRepo, canonicalRepo);
      }
    }
  }
  result.sessionsMigrated++;
}

export function migrateSingleToMultiRepo(
  mimoHome: string = join(homedir(), ".mimo"),
  options: MigrationOptions = {},
): MultiRepoMigrationResult {
  const result: MultiRepoMigrationResult = {
    projectsMigrated: 0,
    projectsSkipped: 0,
    sessionsMigrated: 0,
    sessionsSkipped: 0,
    backupsCreated: 0,
    errors: [],
  };
  const projectsDir = join(mimoHome, "projects");
  const migrationOptions: MigrationOptions = {
    ...options,
    vcsReposDir:
      options.vcsReposDir ??
      process.env.MIMO_VCS_REPOS_DIR ??
      join(mimoHome, "session-repos"),
  };
  if (!existsSync(projectsDir)) {
    return result;
  }

  for (const projectEntry of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!projectEntry.isDirectory()) {
      continue;
    }
    const projectDir = join(projectsDir, projectEntry.name);
    const projectYaml = join(projectDir, "project.yaml");
    if (existsSync(projectYaml)) {
      migrateProjectFile(projectYaml, result, migrationOptions);
    }

    const sessionsDir = join(projectDir, "sessions");
    if (!existsSync(sessionsDir)) {
      continue;
    }
    for (const sessionEntry of readdirSync(sessionsDir, {
      withFileTypes: true,
    })) {
      if (!sessionEntry.isDirectory()) {
        continue;
      }
      const sessionYaml = join(sessionsDir, sessionEntry.name, "session.yaml");
      if (existsSync(sessionYaml)) {
        migrateSessionFile(sessionYaml, result, migrationOptions);
      }
    }
  }

  return result;
}

if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run");
  const mimoHome = process.env.MIMO_HOME || join(homedir(), ".mimo");
  const result = migrateSingleToMultiRepo(mimoHome, { dryRun });

  console.log("=".repeat(70));
  console.log("Single-repo → multi-repo migration");
  console.log("=".repeat(70));
  console.log(`MIMO_HOME: ${mimoHome}`);
  console.log(`Mode:      ${dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log(
    `Projects: ${result.projectsMigrated} migrated, ${result.projectsSkipped} skipped`,
  );
  console.log(
    `Sessions: ${result.sessionsMigrated} migrated, ${result.sessionsSkipped} skipped`,
  );
  console.log(`Backups:  ${result.backupsCreated}`);
  if (result.errors.length > 0) {
    console.error("Errors:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
}
