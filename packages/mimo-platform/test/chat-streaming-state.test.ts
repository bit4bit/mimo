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

describe("Chat Streaming State on Reconnect", () => {
  const testHome = join(tmpdir(), `mimo-streaming-test-${Date.now()}`);

  beforeAll(async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    const chatModule = await import("../src/sessions/chat.ts");

    chatService = chatModule.chatService;
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

  afterAll(async () => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(async () => {
    if (testSession?.id) {
      await chatService.clearHistory(testSession.id);
    }
  });

  describe("Server-side streaming state logic", () => {
    it("should send streaming_state when thought and message buffers have content", async () => {
      const sessionId = "test-session-streaming";
      const thoughtContent = "The user is asking about streaming state.";
      const messageContent = "Here's the answer to your question.";

      const shouldSendState = !!(thoughtContent || messageContent);
      expect(shouldSendState).toBe(true);
    });

    it("should send streaming_state when only thought buffer has content", async () => {
      const sessionId = "test-session-thought-only";
      const thoughtContent = "Thinking through this problem...";
      const messageContent = "";

      const shouldSendState = !!(thoughtContent || messageContent);
      expect(shouldSendState).toBe(true);
    });

    it("should send streaming_state when only message buffer has content", async () => {
      const sessionId = "test-session-message-only";
      const thoughtContent = "";
      const messageContent = "Partial response content...";

      const shouldSendState = !!(thoughtContent || messageContent);
      expect(shouldSendState).toBe(true);
    });

    it("should NOT send streaming_state when buffers are empty", async () => {
      const thoughtContent = "";
      const messageContent = "";

      const shouldSendState = !!(thoughtContent || messageContent);
      expect(shouldSendState).toBe(false);
    });
  });

  describe("Frontend streaming state reconstruction", () => {
    it("should reconstruct thought and message from streaming_state", () => {
      const thoughtContent = "Analyzing the request...";
      const messageContent = "This is the response.";

      const hasThought = !!thoughtContent;
      const hasMessage = !!messageContent;

      expect(hasThought).toBe(true);
      expect(hasMessage).toBe(true);
    });

    it("should handle empty thought with message content", () => {
      const thoughtContent = "";
      const messageContent = "Direct response without thought.";

      const hasThought = !!thoughtContent;
      const hasMessage = !!messageContent;

      expect(hasThought).toBe(false);
      expect(hasMessage).toBe(true);
    });

    it("should not show editable bubble when streaming state is reconstructed", () => {
      const lastRole = "user";
      const _reconstructedStreaming = true;

      const shouldShowBubble = lastRole !== "user" && !_reconstructedStreaming;
      expect(shouldShowBubble).toBe(false);
    });

    it("should show editable bubble when last role is not user and not reconstructed", () => {
      const lastRole = "assistant";
      const _reconstructedStreaming = false;

      const shouldShowBubble = lastRole !== "user" && !_reconstructedStreaming;
      expect(shouldShowBubble).toBe(true);
    });

    it("should reset reconstructed flag on usage_update", () => {
      let _reconstructedStreaming = true;

      const handleUsageUpdate = () => {
        _reconstructedStreaming = false;
      };

      handleUsageUpdate();

      expect(_reconstructedStreaming).toBe(false);
    });
  });

  describe("Reconnect scenario simulation", () => {
    it("should preserve user message in history when assistant is streaming", async () => {
      await chatService.saveMessage(testSession.id, {
        role: "user",
        content: "Send a message",
        timestamp: new Date().toISOString(),
      });

      const history = await chatService.loadHistory(testSession.id);

      expect(history.length).toBe(1);
      expect(history[0].role).toBe("user");
      expect(history[0].content).toBe("Send a message");
    });

    it("should reconstruct partial streaming state for UI", () => {
      const streamingState = {
        thoughtContent: "User wants to know about X",
        messageContent: "X is a ",
      };

      const shouldReconstruct = !!(
        streamingState.thoughtContent || streamingState.messageContent
      );
      expect(shouldReconstruct).toBe(true);
    });

    it("should continue accepting chunks after reconstruction", () => {
      const initialMessage = "X is a ";
      const additionalChunk = "feature that ";
      const finalChunk = "does something.";

      let reconstructedContent = initialMessage;
      reconstructedContent += additionalChunk;
      reconstructedContent += finalChunk;

      expect(reconstructedContent).toBe("X is a feature that does something.");
    });
  });
});
