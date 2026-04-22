// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync } from "fs";
import { load, dump } from "js-yaml";
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";
import { syncSessionMcpTokens } from "../scripts/sync-session-mcp-tokens.ts";

describe("sync-session-mcp-tokens script", () => {
  let testHome: string;
  let sessionRepository: any;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-sync-mcp-tokens-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key" },
      services: { sharedFossil: new DummySharedFossilServer() },
    });
    sessionRepository = ctx.repos.sessions;
  });

  it("generates missing tokens and is idempotent on repeated runs", async () => {
    const session = await sessionRepository.create({
      name: "Token migration test",
      projectId: "project-1",
      owner: "owner",
    });

    const sessionYamlPath = join(
      testHome,
      "projects",
      "project-1",
      "sessions",
      session.id,
      "session.yaml",
    );

    const raw = readFileSync(sessionYamlPath, "utf-8");
    const data = load(raw) as any;
    delete data.mcpToken;
    writeFileSync(sessionYamlPath, dump(data), "utf-8");

    const first = syncSessionMcpTokens(testHome);
    expect(first.updated).toBe(1);
    expect(first.alreadyHadToken).toBe(0);

    const firstData = load(readFileSync(sessionYamlPath, "utf-8")) as any;
    expect(typeof firstData.mcpToken).toBe("string");
    expect(firstData.mcpToken.length).toBeGreaterThan(0);
    const tokenAfterFirstRun = firstData.mcpToken;

    const second = syncSessionMcpTokens(testHome);
    expect(second.updated).toBe(0);
    expect(second.alreadyHadToken).toBe(1);

    const secondData = load(readFileSync(sessionYamlPath, "utf-8")) as any;
    expect(secondData.mcpToken).toBe(tokenAfterFirstRun);
  });
});
