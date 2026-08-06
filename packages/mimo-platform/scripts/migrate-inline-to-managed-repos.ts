#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Migration: inline project repository entries -> managed repository entities.
 *
 * For every project repository entry that still carries inline connection
 * details (repoUrl/repoType/credentialId/clonePort) this script creates one
 * managed repository entity under the project owner and rewrites the entry
 * to a reference ({ id, name, repoId, sourceBranch, newBranch, mountPath,
 * primary }). Projects without a repositories array get one synthesized
 * from the legacy flat fields first.
 *
 * Idempotent: entries that already carry repoId are skipped. Rollback:
 * restore project.yaml from the generated .bak files.
 *
 * Usage:
 *   bun scripts/migrate-inline-to-managed-repos.ts [--dry-run]
 */

import { homedir } from "os";
import { join } from "path";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { dump, load } from "js-yaml";
import crypto from "crypto";

export interface ManagedRepoMigrationResult {
  projectsMigrated: number;
  projectsSkipped: number;
  repositoriesCreated: number;
  backupsCreated: number;
  errors: string[];
}

interface MigrationOptions {
  dryRun?: boolean;
}

function backupOnce(path: string, result: ManagedRepoMigrationResult): void {
  const backupPath = `${path}.bak`;
  if (!existsSync(backupPath)) {
    copyFileSync(path, backupPath);
    result.backupsCreated++;
  }
}

function repositoriesDir(mimoHome: string, owner: string): string {
  return join(mimoHome, "users", owner, "repositories");
}

function credentialExists(
  mimoHome: string,
  owner: string,
  credentialId: string,
): boolean {
  return existsSync(
    join(mimoHome, "users", owner, "credentials", `${credentialId}.yaml`),
  );
}

function loadManagedByName(
  mimoHome: string,
  owner: string,
): Map<string, string> {
  const byName = new Map<string, string>();
  const dir = repositoriesDir(mimoHome, owner);
  if (!existsSync(dir)) {
    return byName;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) {
      continue;
    }
    const data = load(
      readFileSync(join(dir, entry.name), "utf-8"),
    ) as Record<string, any>;
    if (data.name && data.id) {
      byName.set(String(data.name).toLowerCase(), data.id);
    }
  }
  return byName;
}

function createManagedRepository(
  mimoHome: string,
  owner: string,
  input: {
    name: string;
    repoUrl: string;
    repoType: string;
    credentialId?: string;
    clonePort?: number;
  },
  result: ManagedRepoMigrationResult,
  options: MigrationOptions,
): string {
  const id = crypto.randomUUID();
  if (!options.dryRun) {
    const dir = repositoriesDir(mimoHome, owner);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${id}.yaml`),
      dump({
        id,
        name: input.name,
        repoUrl: input.repoUrl,
        repoType: input.repoType,
        ...(input.credentialId && { credentialId: input.credentialId }),
        ...(input.clonePort != null && { clonePort: input.clonePort }),
        owner,
        createdAt: new Date().toISOString(),
      }),
      "utf-8",
    );
  }
  result.repositoriesCreated++;
  return id;
}

function migrateProjectFile(
  mimoHome: string,
  path: string,
  result: ManagedRepoMigrationResult,
  options: MigrationOptions,
): void {
  const data = load(readFileSync(path, "utf-8")) as Record<string, any>;
  const owner = data.owner;
  if (!owner) {
    result.errors.push(`${path}: missing owner`);
    return;
  }

  const entries: Record<string, any>[] =
    Array.isArray(data.repositories) && data.repositories.length > 0
      ? data.repositories
      : [
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

  const inlineEntries = entries.filter((entry) => !entry.repoId);
  if (inlineEntries.length === 0) {
    result.projectsSkipped++;
    return;
  }

  // Validate before writing anything.
  for (const entry of inlineEntries) {
    if (!entry.repoUrl || !entry.repoType) {
      result.errors.push(
        `${path}: repository "${entry.name ?? entry.id}" is missing repoUrl or repoType`,
      );
      return;
    }
    if (
      entry.credentialId &&
      !credentialExists(mimoHome, owner, entry.credentialId)
    ) {
      result.errors.push(
        `${path}: repository "${entry.name ?? entry.id}" references missing credential "${entry.credentialId}"`,
      );
      return;
    }
  }

  const managedByName = loadManagedByName(mimoHome, owner);
  const rewritten = entries.map((entry) => {
    if (entry.repoId) {
      return entry;
    }

    let repoId = managedByName.get(String(entry.name).toLowerCase());
    if (!repoId) {
      repoId = createManagedRepository(
        mimoHome,
        owner,
        {
          name: entry.name,
          repoUrl: entry.repoUrl,
          repoType: entry.repoType,
          ...(entry.credentialId && { credentialId: entry.credentialId }),
          ...(entry.clonePort != null && { clonePort: entry.clonePort }),
        },
        result,
        options,
      );
      managedByName.set(String(entry.name).toLowerCase(), repoId);
    }

    return {
      id: entry.id,
      name: entry.name,
      repoId,
      ...(entry.sourceBranch && { sourceBranch: entry.sourceBranch }),
      ...(entry.newBranch && { newBranch: entry.newBranch }),
      mountPath: entry.mountPath,
      ...(entry.primary && { primary: entry.primary }),
    };
  });

  if (!options.dryRun) {
    backupOnce(path, result);
    writeFileSync(path, dump({ ...data, repositories: rewritten }), "utf-8");
  }
  result.projectsMigrated++;
}

export function migrateInlineToManagedRepos(
  mimoHome: string = join(homedir(), ".mimo"),
  options: MigrationOptions = {},
): ManagedRepoMigrationResult {
  const result: ManagedRepoMigrationResult = {
    projectsMigrated: 0,
    projectsSkipped: 0,
    repositoriesCreated: 0,
    backupsCreated: 0,
    errors: [],
  };
  const projectsDir = join(mimoHome, "projects");
  if (!existsSync(projectsDir)) {
    return result;
  }

  for (const projectEntry of readdirSync(projectsDir, {
    withFileTypes: true,
  })) {
    if (!projectEntry.isDirectory()) {
      continue;
    }
    const projectYaml = join(projectsDir, projectEntry.name, "project.yaml");
    if (existsSync(projectYaml)) {
      migrateProjectFile(mimoHome, projectYaml, result, options);
    }
  }

  return result;
}

if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run");
  const mimoHome = process.env.MIMO_HOME || join(homedir(), ".mimo");
  const result = migrateInlineToManagedRepos(mimoHome, { dryRun });

  console.log("=".repeat(70));
  console.log("Inline project repositories → managed repositories migration");
  console.log("=".repeat(70));
  console.log(`MIMO_HOME: ${mimoHome}`);
  console.log(`Mode:      ${dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log(
    `Projects:     ${result.projectsMigrated} migrated, ${result.projectsSkipped} skipped`,
  );
  console.log(`Repositories: ${result.repositoriesCreated} created`);
  console.log(`Backups:      ${result.backupsCreated}`);
  if (result.errors.length > 0) {
    console.error("Errors:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
}
