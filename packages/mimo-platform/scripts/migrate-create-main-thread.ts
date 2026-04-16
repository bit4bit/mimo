#!/usr/bin/env bun
/**
 * Migration script: Create a default Main chat thread for legacy sessions.
 *
 * This migration only updates sessions that have no chat threads.
 *
 * Usage:
 *   bun run scripts/migrate-create-main-thread.ts
 *   bun run scripts/migrate-create-main-thread.ts --dry-run
 */

import { join } from "path";
import { homedir } from "os";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { load, dump } from "js-yaml";
import crypto from "crypto";

interface ChatThread {
  id: string;
  name: string;
  model: string;
  mode: string;
  acpSessionId: string | null;
  state: "active" | "parked" | "waking";
  createdAt: string;
}

interface SessionData {
  id: string;
  chatThreads?: ChatThread[];
  activeChatThreadId?: string | null;
  updatedAt?: string;
  [key: string]: unknown;
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

function createMainThread(): ChatThread {
  return {
    id: crypto.randomUUID(),
    name: "Main",
    model: "",
    mode: "",
    acpSessionId: null,
    state: "active",
    createdAt: new Date().toISOString(),
  };
}

function migrateSessionHistoryToThread(
  sessionPath: string,
  threadId: string,
  dryRun: boolean,
): boolean {
  const sessionDir = join(sessionPath, "..");
  const legacySessionHistoryPath = join(sessionDir, "chat.jsonl");
  const fallbackSessionHistoryPath = join(
    sessionDir,
    "chat-threads",
    "__session__.jsonl",
  );

  let sourcePath: string | null = null;
  if (existsSync(fallbackSessionHistoryPath)) {
    sourcePath = fallbackSessionHistoryPath;
  } else if (existsSync(legacySessionHistoryPath)) {
    sourcePath = legacySessionHistoryPath;
  }

  if (!sourcePath) {
    return false;
  }

  const targetDir = join(sessionDir, "chat-threads");
  const targetPath = join(targetDir, `${threadId}.jsonl`);
  const history = readFileSync(sourcePath, "utf-8");

  if (!dryRun) {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    writeFileSync(targetPath, history, "utf-8");
  }

  return true;
}

function migrateSession(
  sessionPath: string,
  dryRun: boolean,
): { migrated: boolean; reason?: string } {
  const content = readFileSync(sessionPath, "utf-8");
  const data = load(content) as SessionData;

  if (!data || typeof data !== "object") {
    return { migrated: false, reason: "invalid session file" };
  }

  if (Array.isArray(data.chatThreads) && data.chatThreads.length > 0) {
    return { migrated: false, reason: "already has chat threads" };
  }

  const mainThread = createMainThread();
  const updatedData: SessionData = {
    ...data,
    chatThreads: [mainThread],
    activeChatThreadId: mainThread.id,
    updatedAt: new Date().toISOString(),
  };

  if (!dryRun) {
    writeFileSync(sessionPath, dump(updatedData), "utf-8");
  }

  const historyMigrated = migrateSessionHistoryToThread(
    sessionPath,
    mainThread.id,
    dryRun,
  );

  if (historyMigrated) {
    return { migrated: true, reason: "history migrated" };
  }

  return { migrated: true };
}

async function main() {
  const mimoHome = process.env.MIMO_HOME || join(homedir(), ".mimo");
  const projectsPath = join(mimoHome, "projects");
  const dryRun = process.argv.includes("--dry-run");

  console.log("Create Main Thread Migration");
  console.log(`MIMO_HOME: ${mimoHome}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN" : "LIVE"}`);

  if (!existsSync(projectsPath)) {
    console.log("No projects directory found. Nothing to migrate.");
    process.exit(0);
  }

  const sessionFiles = findSessionFiles(projectsPath);
  console.log(`Found ${sessionFiles.length} session files`);

  let migratedCount = 0;
  let skippedCount = 0;
  const errors: Array<{ path: string; error: string }> = [];

  for (const sessionPath of sessionFiles) {
    try {
      const result = migrateSession(sessionPath, dryRun);
      if (result.migrated) {
        if (result.reason) {
          console.log(
            `✓ ${dryRun ? "Would migrate" : "Migrated"}: ${sessionPath} (${result.reason})`,
          );
        } else {
          console.log(`✓ ${dryRun ? "Would migrate" : "Migrated"}: ${sessionPath}`);
        }
        migratedCount++;
      } else {
        console.log(`⊘ Skipped: ${sessionPath} (${result.reason})`);
        skippedCount++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ Error: ${sessionPath} - ${message}`);
      errors.push({ path: sessionPath, error: message });
    }
  }

  console.log("\nMigration complete:");
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Skipped: ${skippedCount}`);
  console.log(`  Errors: ${errors.length}`);

  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
