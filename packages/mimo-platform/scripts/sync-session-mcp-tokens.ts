// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

#!/usr/bin/env bun

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import crypto from "crypto";
import { dump, load } from "js-yaml";

export interface SyncSessionMcpTokensResult {
  updated: number;
  alreadyHadToken: number;
}

function listSessionYamlPaths(projectsPath: string): string[] {
  const files: string[] = [];
  const projectEntries = readdirSync(projectsPath, { withFileTypes: true });

  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) continue;
    const sessionsPath = join(projectsPath, projectEntry.name, "sessions");

    let sessionEntries;
    try {
      sessionEntries = readdirSync(sessionsPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const sessionEntry of sessionEntries) {
      if (!sessionEntry.isDirectory()) continue;
      files.push(join(sessionsPath, sessionEntry.name, "session.yaml"));
    }
  }

  return files;
}

export function syncSessionMcpTokens(mimoHome: string): SyncSessionMcpTokensResult {
  const projectsPath = join(mimoHome, "projects");
  const sessionYamlPaths = listSessionYamlPaths(projectsPath);

  let updated = 0;
  let alreadyHadToken = 0;

  for (const filePath of sessionYamlPaths) {
    const raw = readFileSync(filePath, "utf-8");
    const data = (load(raw) as Record<string, unknown>) ?? {};

    if (typeof data.mcpToken === "string" && data.mcpToken.length > 0) {
      alreadyHadToken += 1;
      continue;
    }

    data.mcpToken = crypto.randomUUID();
    writeFileSync(filePath, dump(data), "utf-8");
    updated += 1;
  }

  return { updated, alreadyHadToken };
}

function main(): void {
  const mimoHome = process.env.MIMO_HOME ?? join(homedir(), ".mimo");
  const result = syncSessionMcpTokens(mimoHome);
  console.log(
    `Updated sessions: ${result.updated}, already had token: ${result.alreadyHadToken}`,
  );
}

if (import.meta.main) {
  main();
}
