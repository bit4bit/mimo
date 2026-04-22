// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";

let mimoContext: any;
let sessionRepository: any;
let testHome: string;

describe("Session MCP Token", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-mcp-token-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
      services: { sharedFossil: new DummySharedFossilServer() },
    });
    mimoContext = ctx;
    sessionRepository = ctx.repos.sessions;

    const vcsModule = await import("../src/vcs/index.ts");
    vcsModule.vcs.cloneRepository = async () => ({ success: true });
    vcsModule.vcs.importToFossil = async () => ({ success: true });
    vcsModule.vcs.openFossilCheckout = async () => ({ success: true });
    vcsModule.vcs.openFossil = async () => ({ success: true });
    vcsModule.vcs.syncIgnoresToFossil = async () => ({ success: true });
    vcsModule.vcs.createFossilUser = async () => ({ success: true });
  });

  it("1.4: session created → mcpToken is a non-empty UUID", async () => {
    const session = await sessionRepository.create({
      name: "mcp-token-test-session",
      projectId: "test-project",
      owner: "tester",
    });

    expect(typeof session.mcpToken).toBe("string");
    expect(session.mcpToken.length).toBeGreaterThan(0);

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(session.mcpToken)).toBe(true);
  });

  it("1.5: session loaded from YAML → mcpToken is preserved", async () => {
    const session = await sessionRepository.create({
      name: "mcp-token-persist-test",
      projectId: "test-project",
      owner: "tester",
    });

    const originalToken = session.mcpToken;
    expect(typeof originalToken).toBe("string");
    expect(originalToken.length).toBeGreaterThan(0);

    const loaded = await sessionRepository.findById(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.mcpToken).toBe(originalToken);
  });
});
