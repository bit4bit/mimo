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
import { rmSync, existsSync } from "fs";

// Dynamic imports to set up environment first
let sessionRepository: any;
let projectRepository: any;
let userRepository: any;
let chatService: any;
let ChatMessage: any;
let ctx: any;

describe("Chat History Persistence", () => {
  const testHome = join(tmpdir(), `mimo-chat-test-${Date.now()}`);
  let testUser: { username: string };
  let testProject: { id: string };
  let testSession: { id: string };

  beforeAll(async () => {
    // Set up fresh environment with createMimoContext
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    userRepository = ctx.repos.users;
    projectRepository = ctx.repos.projects;
    sessionRepository = ctx.repos.sessions;

    // Use ChatService from mimoContext instead of singleton
    chatService = ctx.services.chat;
    const chatModule = await import("../src/sessions/chat.ts");
    ChatMessage = chatModule.ChatMessage;

    // Create test user
    const bcrypt = await import("bcrypt");
    await userRepository.create("testuser", await bcrypt.hash("testpass", 10));
    testUser = { username: "testuser" };

    // Create test project
    const project = await projectRepository.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });
    testProject = project;

    // Create test session
    const session = await sessionRepository.create({
      name: "Test Session",
      projectId: project.id,
      owner: "testuser",
    });
    testSession = session;
  });

  afterAll(async () => {
    // Clean up
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(async () => {
    // Clear chat history for this session before each test
    if (testSession?.id) {
      await chatService.clearHistory(testSession.id);
    }
  });

  describe("saveMessage", () => {
    it("should save user message to history", async () => {
      const message = {
        role: "user",
        content: "Hello, agent!",
        timestamp: new Date().toISOString(),
      };

      await chatService.saveMessage(testSession.id, message);

      const messages = await chatService.loadHistory(testSession.id);
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello, agent!");
    });

    it("should save assistant message with thoughts", async () => {
      const message = {
        role: "assistant",
        content: `<details><summary>Thought Process</summary>The user is asking who I am. I should answer concisely.</details>

I'm an AI assistant for software engineering tasks.`,
        timestamp: new Date().toISOString(),
      };

      await chatService.saveMessage(testSession.id, message);

      const messages = await chatService.loadHistory(testSession.id);
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe("assistant");
      expect(messages[0].content).toContain("Thought Process");
      expect(messages[0].content).toContain("I'm an AI assistant");
    });

    it("should save multiple messages in order", async () => {
      await chatService.saveMessage(testSession.id, {
        role: "user",
        content: "Question 1",
        timestamp: new Date().toISOString(),
      });

      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: "Answer 1",
        timestamp: new Date().toISOString(),
      });

      await chatService.saveMessage(testSession.id, {
        role: "user",
        content: "Question 2",
        timestamp: new Date().toISOString(),
      });

      const messages = await chatService.loadHistory(testSession.id);
      expect(messages.length).toBe(3);
      expect(messages[0].content).toBe("Question 1");
      expect(messages[1].content).toBe("Answer 1");
      expect(messages[2].content).toBe("Question 2");
    });
  });

  describe("Streaming message persistence", () => {
    it("should save message assembled from chunks", async () => {
      // Simulate streaming message chunks
      const chunks = ["I'm ", "an ", "AI ", "assistant."];

      const fullContent = chunks.join("");

      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: fullContent,
        timestamp: new Date().toISOString(),
      });

      const messages = await chatService.loadHistory(testSession.id);
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe("I'm an AI assistant.");
    });

    it("should save message with multiline thought content", async () => {
      const thoughtContent = `The user is asking for help.

1. They need debugging assistance
2. I should ask for more context
3. Then provide specific guidance`;

      const message = {
        role: "assistant",
        content: `<details><summary>Thought Process</summary>${thoughtContent}</details>

How can I help you debug this issue?`,
        timestamp: new Date().toISOString(),
      };

      await chatService.saveMessage(testSession.id, message);

      const messages = await chatService.loadHistory(testSession.id);
      expect(messages.length).toBe(1);
      expect(messages[0].content).toContain("The user is asking for help");
      expect(messages[0].content).toContain("How can I help you debug");
    });

    it("should persist thought process separately from response", async () => {
      const thought = "Let me think about this systematically...";
      const response = "The answer is 42.";

      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: `<details><summary>Thought Process</summary>${thought}</details>

${response}`,
        timestamp: new Date().toISOString(),
      });

      const messages = await chatService.loadHistory(testSession.id);
      const savedContent = messages[0].content;

      // Verify both thought and response are present
      expect(savedContent).toContain(thought);
      expect(savedContent).toContain(response);

      // Verify structure is preserved
      expect(savedContent).toContain("<details>");
      expect(savedContent).toContain("</details>");
    });
  });

  describe("History persistence across reloads", () => {
    it("should load history after page refresh simulation", async () => {
      // Save initial messages
      await chatService.saveMessage(testSession.id, {
        role: "user",
        content: "Who are you?",
        timestamp: new Date().toISOString(),
      });

      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: `<details><summary>Thought Process</summary>The user wants to know my identity.</details>

I'm an AI assistant.`,
        timestamp: new Date().toISOString(),
      });

      // Simulate reload by loading fresh
      const messages = await chatService.loadHistory(testSession.id);

      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
    });

    it("should preserve message order after multiple operations", async () => {
      // Interleave user and assistant messages
      const messages = [
        {
          role: "user",
          content: "First question",
          timestamp: new Date().toISOString(),
        },
        {
          role: "assistant",
          content: "First answer",
          timestamp: new Date().toISOString(),
        },
        {
          role: "user",
          content: "Second question",
          timestamp: new Date().toISOString(),
        },
        {
          role: "assistant",
          content: "Second answer",
          timestamp: new Date().toISOString(),
        },
      ];

      for (const msg of messages) {
        await chatService.saveMessage(testSession.id, msg);
      }

      const loaded = await chatService.loadHistory(testSession.id);

      expect(loaded.length).toBe(4);
      expect(loaded.map((m) => m.content)).toEqual([
        "First question",
        "First answer",
        "Second question",
        "Second answer",
      ]);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty message content", async () => {
      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      });

      const messages = await chatService.loadHistory(testSession.id);
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe("");
    });

    it("should handle special characters in content", async () => {
      const specialContent = `function test() {
  return "Hello <world> & 'test'";
}`;

      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: specialContent,
        timestamp: new Date().toISOString(),
      });

      const messages = await chatService.loadHistory(testSession.id);
      expect(messages[0].content).toBe(specialContent);
    });

    it("should handle very long messages", async () => {
      const longContent = "a".repeat(10000);

      await chatService.saveMessage(testSession.id, {
        role: "assistant",
        content: longContent,
        timestamp: new Date().toISOString(),
      });

      const messages = await chatService.loadHistory(testSession.id);
      expect(messages[0].content.length).toBe(10000);
    });
  });
});
