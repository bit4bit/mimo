#!/usr/bin/env bun
/**
 * Migration script: Move session-level acpSessionId to thread-level
 *
 * This script migrates existing sessions by copying the session-level
 * acpSessionId to each thread's acpSessionId field.
 *
 * Run: bun run scripts/migrate-thread-acpsessionid.ts
 */

import { join } from "path";
import { homedir } from "os";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { load, dump } from "js-yaml";

const MIMO_HOME = process.env.MIMO_HOME || join(homedir(), ".mimo");
const PROJECTS_PATH = join(MIMO_HOME, "projects");

interface SessionData {
  id: string;
  acpSessionId?: string | null;
  chatThreads?: ChatThreadData[];
  [key: string]: any;
}

interface ChatThreadData {
  id: string;
  name: string;
  acpSessionId?: string | null;
  [key: string]: any;
}

function findSessionFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findSessionFiles(fullPath));
    } else if (entry.name === "session.yaml") {
      files.push(fullPath);
    }
  }

  return files;
}

function migrateSession(sessionPath: string): { migrated: boolean; reason?: string } {
  const content = readFileSync(sessionPath, "utf-8");
  const data = load(content) as SessionData;

  if (!data.chatThreads || data.chatThreads.length === 0) {
    return { migrated: false, reason: "no chat threads" };
  }

  const sessionAcpSessionId = data.acpSessionId;

  if (!sessionAcpSessionId) {
    return { migrated: false, reason: "no session-level acpSessionId" };
  }

  let needsMigration = false;
  const updatedThreads = data.chatThreads.map((thread) => {
    if (!thread.acpSessionId) {
      needsMigration = true;
      return { ...thread, acpSessionId: sessionAcpSessionId };
    }
    return thread;
  });

  if (!needsMigration) {
    return { migrated: false, reason: "all threads already have acpSessionId" };
  }

  // Write updated session data
  const updatedData = {
    ...data,
    chatThreads: updatedThreads,
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(sessionPath, dump(updatedData), "utf-8");

  return { migrated: true };
}

async function main() {
  console.log("Migrating thread acpSessionId...");
  console.log(`MIMO_HOME: ${MIMO_HOME}`);

  if (!existsSync(PROJECTS_PATH)) {
    console.log("No projects directory found. Nothing to migrate.");
    process.exit(0);
  }

  const sessionFiles = findSessionFiles(PROJECTS_PATH);
  console.log(`Found ${sessionFiles.length} session files`);

  let migratedCount = 0;
  let skippedCount = 0;
  const errors: Array<{ path: string; error: string }> = [];

  for (const sessionPath of sessionFiles) {
    try {
      const result = migrateSession(sessionPath);
      if (result.migrated) {
        console.log(`✓ Migrated: ${sessionPath}`);
        migratedCount++;
      } else {
        console.log(`⊘ Skipped: ${sessionPath} (${result.reason})`);
        skippedCount++;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`✗ Error: ${sessionPath} - ${errorMsg}`);
      errors.push({ path: sessionPath, error: errorMsg });
    }
  }

  console.log("\nMigration complete:");
  console.log(`  Migrated: ${migratedCount} sessions`);
  console.log(`  Skipped: ${skippedCount} sessions`);
  console.log(`  Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log("\nErrors encountered:");
    errors.forEach(({ path, error }) => {
      console.log(`  ${path}: ${error}`);
    });
    process.exit(1);
  }

  process.exit(0);
}

main();
