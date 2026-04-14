#!/usr/bin/env bun
/**
 * Migration Script: Move fossil repositories from session directories to centralized storage
 *
 * This script migrates from the old per-session fossil storage:
 *   ~/.mimo/projects/<project>/sessions/<session>/repo.fossil
 *
 * To the new centralized storage:
 *   ~/.mimo/session-fossils/<normalized-session-id>.fossil
 *
 * Usage:
 *   bun scripts/migrate-fossil-repos.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 */

import { existsSync, mkdirSync, renameSync, statSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { load } from "js-yaml";

// Get MIMO_HOME from environment or use default
const MIMO_HOME = process.env.MIMO_HOME || join(homedir(), ".mimo");

// Normalize session ID for fossil filename (same as in shared-fossil-server.ts)
function normalizeSessionIdForFossil(sessionId: string): string {
  return sessionId.replace(/-/g, "_");
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

interface MigrationStats {
  totalSessions: number;
  migrated: number;
  skipped: number;
  errors: number;
  errorsDetails: string[];
}

async function findSessions(): Promise<
  Array<{ projectId: string; sessionId: string; oldPath: string }>
> {
  const sessions: Array<{
    projectId: string;
    sessionId: string;
    oldPath: string;
  }> = [];
  const projectsDir = getProjectsDir();

  if (!existsSync(projectsDir)) {
    console.log("No projects directory found");
    return sessions;
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
      const oldFossilPath = join(sessionsDir, sessionId, "repo.fossil");

      if (existsSync(oldFossilPath)) {
        sessions.push({ projectId, sessionId, oldPath: oldFossilPath });
      }
    }
  }

  return sessions;
}

async function migrateSession(
  session: { projectId: string; sessionId: string; oldPath: string },
  dryRun: boolean,
): Promise<{ success: boolean; newPath: string | null; error?: string }> {
  try {
    const normalizedId = normalizeSessionIdForFossil(session.sessionId);
    const newPath = join(getSessionFossilsDir(), `${normalizedId}.fossil`);

    // Check if file already exists at destination
    if (existsSync(newPath)) {
      return {
        success: false,
        newPath: null,
        error: `File already exists at destination: ${newPath}`,
      };
    }

    if (dryRun) {
      console.log(`[DRY-RUN] Would move: ${session.oldPath} -> ${newPath}`);
      return { success: true, newPath };
    }

    // Ensure destination directory exists
    const destDir = dirname(newPath);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    // Move the file
    renameSync(session.oldPath, newPath);
    console.log(`✓ Migrated: ${session.sessionId}`);

    return { success: true, newPath };
  } catch (error) {
    return {
      success: false,
      newPath: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dataDir = getDataDir();
  const sessionFossilsDir = getSessionFossilsDir();

  console.log("=".repeat(70));
  console.log("Fossil Repository Migration Script");
  console.log("=".repeat(70));
  console.log();
  console.log(`Data directory: ${dataDir}`);
  console.log(`Session fossils directory: ${sessionFossilsDir}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN (no changes will be made)" : "LIVE"}`);
  console.log();

  // Ensure session-fossils directory exists
  if (!existsSync(sessionFossilsDir)) {
    if (!dryRun) {
      mkdirSync(sessionFossilsDir, { recursive: true });
      console.log(`Created directory: ${sessionFossilsDir}`);
    } else {
      console.log(`[DRY-RUN] Would create directory: ${sessionFossilsDir}`);
    }
  }

  // Find all sessions with fossil repos
  console.log("Scanning for fossil repositories...");
  const sessions = await findSessions();
  console.log(`Found ${sessions.length} sessions with fossil repositories`);
  console.log();

  if (sessions.length === 0) {
    console.log("No repositories to migrate. Done!");
    return;
  }

  // Show what will be migrated
  console.log("Sessions to migrate:");
  for (const session of sessions) {
    const newPath = join(
      getSessionFossilsDir(),
      `${normalizeSessionIdForFossil(session.sessionId)}.fossil`,
    );
    console.log(`  - ${session.sessionId}`);
    console.log(`    From: ${session.oldPath}`);
    console.log(`    To:   ${newPath}`);
  }
  console.log();

  if (dryRun) {
    console.log("This was a dry-run. No changes were made.");
    console.log("Run without --dry-run to perform the migration.");
    return;
  }

  // Confirm before proceeding
  console.log("Press Ctrl+C to cancel, or wait 5 seconds to proceed...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log("Proceeding with migration...");
  console.log();

  // Migrate each session
  const stats: MigrationStats = {
    totalSessions: sessions.length,
    migrated: 0,
    skipped: 0,
    errors: 0,
    errorsDetails: [],
  };

  for (const session of sessions) {
    const result = await migrateSession(session, false);

    if (result.success) {
      stats.migrated++;
    } else if (result.error?.includes("already exists")) {
      stats.skipped++;
      console.log(`⚠ Skipped ${session.sessionId}: ${result.error}`);
    } else {
      stats.errors++;
      stats.errorsDetails.push(`${session.sessionId}: ${result.error}`);
      console.log(`✗ Error migrating ${session.sessionId}: ${result.error}`);
    }
  }

  // Report results
  console.log();
  console.log("=".repeat(70));
  console.log("Migration Complete");
  console.log("=".repeat(70));
  console.log();
  console.log(`Total sessions:     ${stats.totalSessions}`);
  console.log(`Successfully moved: ${stats.migrated}`);
  console.log(`Skipped (exists):   ${stats.skipped}`);
  console.log(`Errors:             ${stats.errors}`);

  if (stats.errors > 0) {
    console.log();
    console.log("Errors:");
    for (const error of stats.errorsDetails) {
      console.log(`  - ${error}`);
    }
    console.log();
    console.log("Some sessions failed to migrate. You may need to:");
    console.log("1. Check file permissions");
    console.log("2. Ensure no processes are using the fossil files");
    console.log("3. Run the migration script again");
    process.exit(1);
  }

  console.log();
  console.log("✓ All repositories migrated successfully!");
  console.log();
  console.log("Next steps:");
  console.log("1. Update your mimo-platform to the latest version");
  console.log("2. Restart the platform to use the shared fossil server");
  console.log("3. Update your mimo-agent to support the new fossilUrl format");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
