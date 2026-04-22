// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

#!/usr/bin/env bun

import { homedir } from "os";
import { join } from "path";
import { createMimoContext } from "../src/context/mimo-context.js";
import { SharedFossilServer } from "../src/vcs/shared-fossil-server.js";
import { migrateDevWorkspaceUsers } from "../src/sessions/dev-workspace-user-migration.js";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const mimoHome = process.env.MIMO_HOME || join(homedir(), ".mimo");

  console.log("=".repeat(70));
  console.log("Dev Workspace User Migration");
  console.log("=".repeat(70));
  console.log(`MIMO_HOME: ${mimoHome}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log();

  const context = createMimoContext({
    env: {
      MIMO_HOME: mimoHome,
      JWT_SECRET: process.env.JWT_SECRET || "migration-only-secret",
      FOSSIL_SERVER_PORT: process.env.FOSSIL_SERVER_PORT,
      FOSSIL_REPOS_DIR: process.env.FOSSIL_REPOS_DIR,
    },
    services: {
      sharedFossil: new SharedFossilServer({
        port: parseInt(process.env.FOSSIL_SERVER_PORT || "8000", 10),
        reposDir:
          process.env.FOSSIL_REPOS_DIR || join(mimoHome, "session-fossils"),
      }),
    },
  });

  const result = await migrateDevWorkspaceUsers({
    sessionRepository: context.repos.sessions,
    vcs: context.services.vcs,
    dryRun,
  });

  for (const sessionResult of result.sessions) {
    if (sessionResult.status === "updated") {
      console.log(`✓ ${sessionResult.sessionId}: ${sessionResult.reason}`);
    } else if (sessionResult.status === "skipped") {
      console.log(`- ${sessionResult.sessionId}: ${sessionResult.reason}`);
    } else {
      console.log(`✗ ${sessionResult.sessionId}: ${sessionResult.reason}`);
    }
  }

  console.log();
  console.log("Summary");
  console.log(`  Total:   ${result.summary.total}`);
  console.log(`  Updated: ${result.summary.updated}`);
  console.log(`  Skipped: ${result.summary.skipped}`);
  console.log(`  Failed:  ${result.summary.failed}`);

  if (dryRun) {
    console.log();
    console.log("Dry run complete. Re-run without --dry-run to apply changes.");
  }

  if (result.summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
