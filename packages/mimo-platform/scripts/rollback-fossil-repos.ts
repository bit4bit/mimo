#!/usr/bin/env bun
/**
 * Rollback Script: Move fossil repositories back from centralized storage to session directories
 *
 * This script reverses the migration, moving from:
 *   ~/.mimo/session-fossils/<normalized-session-id>.fossil
 *
 * Back to the old per-session fossil storage:
 *   ~/.mimo/projects/<project>/sessions/<session>/repo.fossil
 *
 * Usage:
 *   bun scripts/rollback-fossil-repos.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 */

import { existsSync, mkdirSync, renameSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { load } from "js-yaml";
import { readFileSync } from "fs";

// Get MIMO_HOME from environment or use default
const MIMO_HOME = process.env.MIMO_HOME || join(homedir(), ".mimo");

// Denormalize session ID from fossil filename back to original
function denormalizeSessionId(normalizedId: string): string {
  return normalizedId.replace(/_/g, "-");
}

// Get the data directory
function getDataDir(): string {
  return MIMO_HOME;
}

// Get the centralized fossil repos directory
function getSessionFossilsDir(): string {
  return process.env.FOSSIL_REPOS_DIR || join(getDataDir(), "session-fossils");
}

// Get the projects directory
function getProjectsDir(): string {
  return join(getDataDir(), "projects");
}

interface RollbackStats {
  totalFiles: number;
  rolledBack: number;
  skipped: number;
  errors: number;
  errorsDetails: string[];
}

async function findSessionForFossil(normalizedId: string): Promise<{
  projectId: string;
  sessionId: string;
  sessionFile: string;
} | null> {
  const originalId = denormalizeSessionId(normalizedId);
  const projectsDir = getProjectsDir();

  if (!existsSync(projectsDir)) {
    return null;
  }

  const projectEntries = readdirSync(projectsDir, { withFileTypes: true });

  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) continue;

    const projectId = projectEntry.name;
    const sessionsDir = join(projectsDir, projectId, "sessions");

    if (!existsSync(sessionsDir)) continue;

    const sessionEntries = readdirSync(sessionsDir, { withFileTypes: true });

    for (const sessionEntry of sessionEntries) {
      if (!sessionEntry.isDirectory()) continue;

      const sessionId = sessionEntry.name;
      if (sessionId === originalId) {
        const sessionFile = join(sessionsDir, sessionId, "session.yaml");
        if (existsSync(sessionFile)) {
          return { projectId, sessionId, sessionFile };
        }
      }
    }
  }

  return null;
}

async function findFossilFiles(): Promise<
  Array<{
    normalizedId: string;
    currentPath: string;
    originalSession: {
      projectId: string;
      sessionId: string;
      sessionFile: string;
    } | null;
  }>
> {
  const files: Array<{
    normalizedId: string;
    currentPath: string;
    originalSession: {
      projectId: string;
      sessionId: string;
      sessionFile: string;
    } | null;
  }> = [];
  const sessionFossilsDir = getSessionFossilsDir();

  if (!existsSync(sessionFossilsDir)) {
    console.log("No session-fossils directory found");
    return files;
  }

  const entries = readdirSync(sessionFossilsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".fossil")) continue;

    const normalizedId = entry.name.replace(".fossil", "");
    const currentPath = join(sessionFossilsDir, entry.name);

    // Try to find the original session
    const originalSession = await findSessionForFossil(normalizedId);

    files.push({ normalizedId, currentPath, originalSession });
  }

  return files;
}

async function rollbackFile(
  file: {
    normalizedId: string;
    currentPath: string;
    originalSession: {
      projectId: string;
      sessionId: string;
      sessionFile: string;
    } | null;
  },
  dryRun: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!file.originalSession) {
      return {
        success: false,
        error: `Could not find original session for ${file.normalizedId}`,
      };
    }

    const oldPath = join(
      getProjectsDir(),
      file.originalSession.projectId,
      "sessions",
      file.originalSession.sessionId,
      "repo.fossil",
    );

    // Check if file already exists at destination
    if (existsSync(oldPath)) {
      return {
        success: false,
        error: `File already exists at destination: ${oldPath}`,
      };
    }

    if (dryRun) {
      console.log(`[DRY-RUN] Would move: ${file.currentPath} -> ${oldPath}`);
      return { success: true };
    }

    // Ensure destination directory exists
    const destDir = dirname(oldPath);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    // Move the file
    renameSync(file.currentPath, oldPath);
    console.log(`✓ Rolled back: ${file.originalSession.sessionId}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dataDir = getDataDir();
  const sessionFossilsDir = getSessionFossilsDir();

  console.log("=".repeat(70));
  console.log("Fossil Repository Rollback Script");
  console.log("=".repeat(70));
  console.log();
  console.log(`Data directory: ${dataDir}`);
  console.log(`Session fossils directory: ${sessionFossilsDir}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN (no changes will be made)" : "LIVE"}`);
  console.log();
  console.log(
    "⚠️  WARNING: This will move fossil repositories BACK to session directories",
  );
  console.log("   Only use this if you need to revert the migration!");
  console.log();

  // Find all fossil files in centralized storage
  console.log("Scanning for fossil repositories in centralized storage...");
  const files = await findFossilFiles();
  console.log(`Found ${files.length} fossil repositories to roll back`);
  console.log();

  if (files.length === 0) {
    console.log("No repositories to roll back. Done!");
    return;
  }

  // Show what will be rolled back
  console.log("Repositories to roll back:");
  let unknownSessions = 0;
  for (const file of files) {
    if (file.originalSession) {
      const oldPath = join(
        getProjectsDir(),
        file.originalSession.projectId,
        "sessions",
        file.originalSession.sessionId,
        "repo.fossil",
      );
      console.log(`  - ${file.originalSession.sessionId}`);
      console.log(`    From: ${file.currentPath}`);
      console.log(`    To:   ${oldPath}`);
    } else {
      console.log(`  - ${file.normalizedId} (⚠️  original session not found)`);
      unknownSessions++;
    }
  }
  console.log();

  if (unknownSessions > 0) {
    console.log(
      `⚠️  Warning: ${unknownSessions} repositories cannot be rolled back (session not found)`,
    );
    console.log(
      "   These may have been deleted or the session ID doesn't match.",
    );
    console.log();
  }

  if (dryRun) {
    console.log("This was a dry-run. No changes were made.");
    console.log("Run without --dry-run to perform the rollback.");
    return;
  }

  // Confirm before proceeding
  console.log(
    "⚠️  Press Ctrl+C to cancel, or wait 5 seconds to proceed with rollback...",
  );
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log("Proceeding with rollback...");
  console.log();

  // Roll back each file
  const stats: RollbackStats = {
    totalFiles: files.length,
    rolledBack: 0,
    skipped: 0,
    errors: 0,
    errorsDetails: [],
  };

  for (const file of files) {
    if (!file.originalSession) {
      stats.skipped++;
      console.log(`⚠ Skipped ${file.normalizedId}: original session not found`);
      continue;
    }

    const result = await rollbackFile(file, false);

    if (result.success) {
      stats.rolledBack++;
    } else if (result.error?.includes("already exists")) {
      stats.skipped++;
      console.log(
        `⚠ Skipped ${file.originalSession.sessionId}: ${result.error}`,
      );
    } else {
      stats.errors++;
      stats.errorsDetails.push(
        `${file.originalSession.sessionId}: ${result.error}`,
      );
      console.log(
        `✗ Error rolling back ${file.originalSession.sessionId}: ${result.error}`,
      );
    }
  }

  // Report results
  console.log();
  console.log("=".repeat(70));
  console.log("Rollback Complete");
  console.log("=".repeat(70));
  console.log();
  console.log(`Total files:        ${stats.totalFiles}`);
  console.log(`Successfully moved: ${stats.rolledBack}`);
  console.log(`Skipped:            ${stats.skipped}`);
  console.log(`Errors:             ${stats.errors}`);

  if (stats.errors > 0) {
    console.log();
    console.log("Errors:");
    for (const error of stats.errorsDetails) {
      console.log(`  - ${error}`);
    }
    console.log();
    console.log("Some repositories failed to roll back.");
    process.exit(1);
  }

  console.log();
  console.log("✓ Rollback completed successfully!");
  console.log();
  console.log("Note: You may need to:");
  console.log("1. Restore the previous version of mimo-platform");
  console.log("2. Restart the platform");
  console.log("3. Update your mimo-agent to the previous version");
}

main().catch((error) => {
  console.error("Rollback failed:", error);
  process.exit(1);
});
