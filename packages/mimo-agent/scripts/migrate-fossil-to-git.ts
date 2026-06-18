#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Migration: Fossil → Git (mimo-agent side).
 *
 * Removes stale fossil session checkouts and `<sid>.fossil` repo files from the
 * agent work directory so the agent re-clones each session via Git on the next
 * `session_ready`. A leftover fossil checkout dir has no `.git` but is
 * non-empty, which makes `git clone` into it fail; clearing it fixes that.
 *
 * Run on every agent host AFTER the platform migration has completed.
 *
 * Usage:
 *   bun scripts/migrate-fossil-to-git.ts [--dry-run] [--workdir <path>]
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, readdirSync, statSync, rmSync } from "fs";

function parseArgs(): { dryRun: boolean; workDir: string } {
  const argv = process.argv.slice(2);
  let workDir = join(homedir(), ".mimo-agent");
  const dryRun = argv.includes("--dry-run");
  const wIdx = argv.indexOf("--workdir");
  if (wIdx >= 0 && argv[wIdx + 1]) workDir = argv[wIdx + 1];
  return { dryRun, workDir };
}

function isFossilCheckout(dir: string): boolean {
  // Fossil checkout marker exists and it is not (yet) a git checkout.
  return existsSync(join(dir, ".fslckout")) && !existsSync(join(dir, ".git"));
}

function main(): void {
  const { dryRun, workDir } = parseArgs();

  console.log("=".repeat(70));
  console.log("Fossil → Git migration (mimo-agent)");
  console.log("=".repeat(70));
  console.log(`workDir: ${workDir}`);
  console.log(`Mode:    ${dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log();

  if (!existsSync(workDir)) {
    console.log("workDir does not exist, nothing to do.");
    return;
  }

  let dirsRemoved = 0;
  let filesRemoved = 0;

  for (const name of readdirSync(workDir)) {
    const full = join(workDir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (isFossilCheckout(full)) {
        if (dryRun) {
          console.log(`~ would remove stale fossil checkout: ${full}`);
        } else {
          rmSync(full, { recursive: true, force: true });
          console.log(`✓ removed stale fossil checkout: ${full}`);
        }
        dirsRemoved++;
      }
    } else if (name.endsWith(".fossil")) {
      if (dryRun) {
        console.log(`~ would remove fossil repo file: ${full}`);
      } else {
        rmSync(full, { force: true });
        console.log(`✓ removed fossil repo file: ${full}`);
      }
      filesRemoved++;
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log(
    `Stale checkouts removed: ${dirsRemoved}; fossil repo files removed: ${filesRemoved}`,
  );
  console.log("=".repeat(70));
  console.log("Agents will re-clone via Git on the next session_ready.");
}

main();
