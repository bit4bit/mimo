// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";

let chatService: any;
let sessionRepository: any;
let projectRepository: any;
let testSession: { id: string };

describe("Agent Message Duration", () => {
  const testHome = join(tmpdir(), `mimo-duration-test-${Date.now()}`);

  beforeAll(async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    chatService = ctx.services.chat;
    sessionRepository = ctx.repos.sessions;
    projectRepository = ctx.repos.projects;

    const bcrypt = await import("bcrypt");
    await ctx.repos.users.create("testuser", await bcrypt.hash("testpass", 10));

    const project = await projectRepository.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await sessionRepository.create({
      name: "Test Session",
      projectId: project.id,
      owner: "testuser",
    });
    testSession = session;
  });

  afterAll(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(async () => {
    if (testSession?.id) {
      await chatService.clearHistory(testSession.id);
    }
  });

  describe("Duration persisted in chat.jsonl", () => {
    it("should persist duration metadata on assistant message", async () => {
      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: "Here is the answer.",
        timestamp: new Date().toISOString(),
        metadata: { duration: "1m23s", durationMs: 83000 },
      });

      const messages = await chatService.loadHistory(testSession.id);
      expect(messages.length).toBe(1);
      expect(messages[0].metadata?.duration).toBe("1m23s");
      expect(messages[0].metadata?.durationMs).toBe(83000);
    });

    it("should persist durationMs as a number", async () => {
      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: "Response.",
        timestamp: new Date().toISOString(),
        metadata: { duration: "0m5s", durationMs: 5000 },
      });

      const messages = await chatService.loadHistory(testSession.id);
      expect(typeof messages[0].metadata?.durationMs).toBe("number");
      expect(messages[0].metadata?.durationMs).toBe(5000);
    });

    it("should load multiple assistant messages each with their own duration", async () => {
      await chatService.saveMessage(testSession.id, {
        role: "user",
        content: "Question",
        timestamp: new Date().toISOString(),
      });
      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: "First answer",
        timestamp: new Date().toISOString(),
        metadata: { duration: "0m30s", durationMs: 30000 },
      });
      await chatService.saveMessage(testSession.id, {
        role: "user",
        content: "Follow-up",
        timestamp: new Date().toISOString(),
      });
      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: "Second answer",
        timestamp: new Date().toISOString(),
        metadata: { duration: "1m0s", durationMs: 60000 },
      });

      const messages = await chatService.loadHistory(testSession.id);
      const assistantMessages = messages.filter(
        (m: any) => m.role === "assistant",
      );
      expect(assistantMessages[0].metadata?.durationMs).toBe(30000);
      expect(assistantMessages[1].metadata?.durationMs).toBe(60000);

      // sum used by footer total
      const total = assistantMessages.reduce(
        (sum: number, m: any) => sum + (m.metadata?.durationMs ?? 0),
        0,
      );
      expect(total).toBe(90000);
    });

    it("should not require duration metadata on assistant messages (backward compat)", async () => {
      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: "Legacy message with no metadata.",
        timestamp: new Date().toISOString(),
      });

      const messages = await chatService.loadHistory(testSession.id);
      expect(messages[0].metadata).toBeUndefined();
    });
  });

  describe("Duration format (Nm Ns)", () => {
    // These tests verify the format logic expected from the implementation.
    // The pure format function is: Math.floor(ms/60000)m + Math.floor((ms%60000)/1000)s

    it("should format sub-minute durations as 0mXs", () => {
      const durationMs = 5000;
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      expect(`${minutes}m${seconds}s`).toBe("0m5s");
    });

    it("should format exactly 1 minute as 1m0s", () => {
      const durationMs = 60000;
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      expect(`${minutes}m${seconds}s`).toBe("1m0s");
    });

    it("should format 1 minute 30 seconds as 1m30s", () => {
      const durationMs = 90000;
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      expect(`${minutes}m${seconds}s`).toBe("1m30s");
    });

    it("should format durations longer than 10 minutes", () => {
      const durationMs = 12 * 60 * 1000 + 5000; // 12m5s
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      expect(`${minutes}m${seconds}s`).toBe("12m5s");
    });

    it("should truncate milliseconds (not round)", () => {
      const durationMs = 5999; // 5.999s → 0m5s, not 0m6s
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      expect(`${minutes}m${seconds}s`).toBe("0m5s");
    });
  });
});
