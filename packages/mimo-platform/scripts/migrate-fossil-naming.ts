#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Migration: fossil → vcs naming (mimo-platform side).
 *
 * The session VCS server is Git, but several names/fields were still "fossil".
 * This migration brings persisted data in line with the renamed identifiers:
 *
 *   - on-disk repos dir   ~/.mimo/session-fossils      → ~/.mimo/session-repos
 *   - session.yaml key     fossilPath:                  → vcsPath:
 *   - impact record key    fossilUrl:                   → cloneUrl:
 *   - config.yaml key      sharedFossilServerPort:      → sharedVcsServerPort:
 *
 * It does NOT touch genuine Fossil-VCS support (`repoType: fossil`, repo.fossil,
 * .fossil-settings, etc.) — only the misnamed shared-session-server data.
 *
 * Safe to run more than once (idempotent). Run with the platform stopped.
 *
 * Renamed environment variables (set these in your deployment — not handled here):
 *   FOSSIL_REPOS_DIR               → MIMO_VCS_REPOS_DIR
 *   MIMO_SHARED_FOSSIL_SERVER_PORT → MIMO_INTERNAL_VCS_PORT
 *   MIMO_SHARED_FOSSIL_SERVER_HOST → MIMO_INTERNAL_VCS_HOST   (earlier rename)
 *
 * Usage:
 *   bun scripts/migrate-fossil-naming.ts [--dry-run]
 */

import { homedir } from "os";
import { join } from "path";
import {
  existsSync,
  renameSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from "fs";

// YAML mapping-key renames, applied line-by-line (key must be at the start of a
// line, after optional indentation). Values are left untouched.
const KEY_RENAMES: Array<[from: string, to: string]> = [
  ["fossilPath", "vcsPath"],
  ["fossilUrl", "cloneUrl"],
  ["sharedFossilServerPort", "sharedVcsServerPort"],
];

function rewriteYamlKeys(content: string): { out: string; changed: number } {
  let changed = 0;
  const lines = content.split("\n").map((line) => {
    for (const [from, to] of KEY_RENAMES) {
      const re = new RegExp(`^(\\s*)${from}(\\s*:)`);
      if (re.test(line)) {
        changed++;
        return line.replace(re, `$1${to}$2`);
      }
    }
    return line;
  });
  return { out: lines.join("\n"), changed };
}

function walkYamlFiles(dir: string, acc: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkYamlFiles(full, acc);
    } else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) {
      acc.push(full);
    }
  }
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  const mimoHome = process.env.MIMO_HOME || join(homedir(), ".mimo");
  const oldDir = join(mimoHome, "session-fossils");
  const newDir = join(mimoHome, "session-repos");

  console.log("=".repeat(70));
  console.log("fossil → vcs naming migration (mimo-platform)");
  console.log("=".repeat(70));
  console.log(`MIMO_HOME:  ${mimoHome}`);
  console.log(`Mode:       ${dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log();

  // 1. Move the default repos directory.
  if (existsSync(oldDir)) {
    if (existsSync(newDir)) {
      console.log(
        `! Both ${oldDir} and ${newDir} exist — leaving as-is (resolve manually).`,
      );
    } else {
      console.log(`repos dir:  session-fossils → session-repos`);
      if (!dryRun) renameSync(oldDir, newDir);
    }
  } else {
    console.log(
      `repos dir:  no ~/.mimo/session-fossils (custom MIMO_VCS_REPOS_DIR or fresh install) — skipping`,
    );
  }

  // 2. Rewrite persisted YAML keys across all records under MIMO_HOME.
  const files: string[] = [];
  walkYamlFiles(mimoHome, files);

  let filesChanged = 0;
  let keysChanged = 0;
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const { out, changed } = rewriteYamlKeys(content);
    if (changed > 0) {
      filesChanged++;
      keysChanged += changed;
      console.log(`yaml:       ${changed} key(s) in ${file}`);
      if (!dryRun) writeFileSync(file, out, { encoding: "utf-8" });
    }
  }

  console.log();
  console.log(
    `Done. ${filesChanged} file(s), ${keysChanged} key(s) ${
      dryRun ? "would be" : "were"
    } updated.`,
  );
  if (dryRun) console.log("Re-run without --dry-run to apply.");
}

main();
