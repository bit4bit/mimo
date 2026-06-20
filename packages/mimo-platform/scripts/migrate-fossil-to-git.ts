#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Migration: Fossil → Git (mimo-platform side).
 *
 * Re-seeds every session's served repository as a bare Git repo and re-clones
 * the platform's own checkout, then removes the fossil artifacts. Project-level
 * `cache.fossil` files are dropped so the Git cache engine rebuilds on demand.
 *
 * Session repos are scratch snapshots seeded from `upstreamPath`, so this is a
 * re-seed, not a history conversion.
 *
 * IMPORTANT (runbook): drain/stop sessions and run a final sync on the OLD code
 * before deploying the Git build and running this. Unsynced edits live in the
 * remote agent checkout and are NOT recovered here. After this runs on the
 * platform host, run `migrate-fossil-to-git.ts` on each agent host.
 *
 * Usage:
 *   bun scripts/migrate-fossil-to-git.ts [--dry-run]
 */

import { homedir } from "os";
import { join } from "path";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import type { OS } from "../src/infrastructure/os/types.js";
import { createMimoContext } from "../src/infrastructure/context/mimo-context.js";

function normalizeSessionIdForFossil(sessionId: string): string {
  return sessionId.replace(/-/g, "_");
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const mimoHome = process.env.MIMO_HOME || join(homedir(), ".mimo");
  const reposDir =
    process.env.MIMO_VCS_REPOS_DIR || join(mimoHome, "session-repos");
  const projectsDir = join(mimoHome, "projects");

  console.log("=".repeat(70));
  console.log("Fossil → Git migration (mimo-platform)");
  console.log("=".repeat(70));
  console.log(`MIMO_HOME:  ${mimoHome}`);
  console.log(`reposDir:   ${reposDir}`);
  console.log(`Mode:       ${dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log();

  const os: OS = createOS({ ...process.env });
  const ctx = createMimoContext({
    env: {
      MIMO_HOME: mimoHome,
      JWT_SECRET: process.env.JWT_SECRET || "migration-only-secret",
      MIMO_VCS_REPOS_DIR: reposDir,
    },
    os,
  });

  const { sessions, projects } = ctx.repos;
  const vcs = ctx.services.vcs;

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const session of await sessions.listAll()) {
    const sid = session.id;
    const repoPath = sessions.getSessionRepoPath(sid);
    const oldFossil = join(
      reposDir,
      `${normalizeSessionIdForFossil(sid)}.fossil`,
    );

    if (os.fs.exists(repoPath)) {
      console.log(`- ${sid}: already on git, skipping`);
      skipped++;
      continue;
    }
    if (!os.fs.exists(session.upstreamPath)) {
      console.log(`- ${sid}: no upstream checkout, skipping`);
      skipped++;
      continue;
    }

    const project = await projects.findById(session.projectId);
    const repoType = (project?.repoType ?? "git") as "git" | "fossil";
    const branch = session.branch ?? undefined;

    if (dryRun) {
      console.log(
        `~ ${sid}: would seed ${repoPath} (${repoType}${branch ? `, ${branch}` : ""}), re-clone checkout, rm ${oldFossil}`,
      );
      migrated++;
      continue;
    }

    const seed = await vcs.seedSessionRepo(
      session.upstreamPath,
      repoType,
      repoPath,
      branch,
    );
    if (!seed.success) {
      console.log(`✗ ${sid}: seed failed: ${seed.error}`);
      failed++;
      continue;
    }

    // Replace the old fossil checkout with a fresh git checkout.
    if (os.fs.exists(session.agentWorkspacePath)) {
      os.fs.rm(session.agentWorkspacePath, { recursive: true, force: true });
    }
    os.fs.mkdir(session.agentWorkspacePath, { recursive: true });
    const co = await vcs.clonePlatformCheckout(
      repoPath,
      session.agentWorkspacePath,
      branch,
    );
    if (!co.success) {
      console.log(`✗ ${sid}: platform checkout failed: ${co.error}`);
      failed++;
      continue;
    }
    await vcs.syncIgnoresToGit(
      session.upstreamPath,
      session.agentWorkspacePath,
    );

    // Drop the old served fossil file.
    if (os.fs.exists(oldFossil)) {
      os.fs.rm(oldFossil, { recursive: true, force: true });
    }

    console.log(`✓ ${sid}: migrated to git`);
    migrated++;
  }

  // Drop project-level fossil caches; the Git cache engine rebuilds on demand.
  let cachesDropped = 0;
  for (const project of await projects.listAll()) {
    const cacheFossil = join(projectsDir, project.id, "cache.fossil");
    if (os.fs.exists(cacheFossil)) {
      if (dryRun) {
        console.log(`~ project ${project.id}: would drop ${cacheFossil}`);
      } else {
        os.fs.rm(cacheFossil, { recursive: true, force: true });
        console.log(`✓ project ${project.id}: dropped fossil cache`);
      }
      cachesDropped++;
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log(
    `Sessions: ${migrated} migrated, ${skipped} skipped, ${failed} failed`,
  );
  console.log(`Project fossil caches dropped: ${cachesDropped}`);
  console.log("=".repeat(70));
  if (!dryRun) {
    console.log("Next: run migrate-fossil-to-git.ts on each agent host.");
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
