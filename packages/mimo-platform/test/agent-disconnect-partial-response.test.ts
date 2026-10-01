import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createWebSocketSetup } from "../src/api/websocket/handlers.js";
import { ChatStreamingPipeline } from "../src/domain/sessions/streaming-pipeline.ts";
import { ChatService } from "../src/domain/sessions/chat.ts";
import { TerminalOutputBuffer } from "../src/api/websocket/terminal-output-buffer.js";
import { createOS } from "../src/infrastructure/os/node-adapter.ts";

const AGENT_ID = "agent-1";
const SESSION_ID = "session-1";
const THREAD_ID = "thread-1";
const IDLE_THREAD_ID = "thread-2";
const PROMPT_ID = "prompt-1";

describe("agent disconnect while a response is streaming", () => {
  let home: string;
  let chatService: ChatService;
  let pipeline: ChatStreamingPipeline;
  let setup: ReturnType<typeof createWebSocketSetup>;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "mimo-agent-disconnect-"));
    const projects = join(home, "projects");
    mkdirSync(join(projects, "project-1", "sessions", SESSION_ID), {
      recursive: true,
    });
    chatService = new ChatService({ projects } as any, createOS({}));
    pipeline = new ChatStreamingPipeline(chatService, () => {});

    const session = {
      id: SESSION_ID,
      activeChatThreadId: THREAD_ID,
      chatThreads: [{ id: THREAD_ID }, { id: IDLE_THREAD_ID }],
    };

    setup = createWebSocketSetup({
      sessionRepository: {
        findByAssignedAgentId: async () => [session],
        findByThreadAgentId: async () => [],
      } as any,
      agentService: { handleAgentDisconnect: async () => {} } as any,
      agentRouter: {} as any,
      pipeline,
      chatSessions: new Map(),
      fileWatchSessions: new Map(),
      terminalSessions: new Map(),
      terminalOutputBuffer: new TerminalOutputBuffer(),
      calculatingSessions: new Set(),
      sccService: {} as any,
      impactCalculator: {} as any,
      chatService,
      fileWatcher: {} as any,
      fileService: {} as any,
      authService: {} as any,
    });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function streamPartialResponse() {
    pipeline.setPromptInFlight(SESSION_ID, THREAD_ID);
    pipeline.handleThoughtStart(SESSION_ID, THREAD_ID, PROMPT_ID);
    pipeline.handleThoughtChunk(SESSION_ID, THREAD_ID, "planning", PROMPT_ID);
    pipeline.handleMessageChunk(SESSION_ID, THREAD_ID, "Half of ", PROMPT_ID);
    pipeline.handleMessageChunk(SESSION_ID, THREAD_ID, "the answer", PROMPT_ID);
  }

  function disconnectAgent() {
    return setup.websocket.close({
      data: { connectionType: "agent", agentId: AGENT_ID },
    });
  }

  it("persists the partial assistant response as interrupted", async () => {
    streamPartialResponse();

    await disconnectAgent();

    const history = await chatService.loadHistory(SESSION_ID, THREAD_ID);
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe("assistant");
    expect(history[0].content).toContain("planning");
    expect(history[0].content).toContain("Half of the answer");
    expect(history[0].metadata?.interrupted).toBe(true);
    expect(history[0].metadata?.promptId).toBe(PROMPT_ID);
  });

  it("does not add messages to threads that had nothing streaming", async () => {
    streamPartialResponse();

    await disconnectAgent();

    expect(await chatService.loadHistory(SESSION_ID, IDLE_THREAD_ID)).toEqual(
      [],
    );
  });

  it("saves a response that completed just before the disconnect exactly once", async () => {
    streamPartialResponse();
    await pipeline.handlePromptCompleted(
      SESSION_ID,
      THREAD_ID,
      { activeChatThreadId: THREAD_ID },
      undefined,
      PROMPT_ID,
    );

    await disconnectAgent();
    await Bun.sleep(200);

    const history = await chatService.loadHistory(SESSION_ID, THREAD_ID);
    expect(history).toHaveLength(1);
    expect(history[0].content).toContain("Half of the answer");
    expect(history[0].metadata?.interrupted).toBeUndefined();
  });
});
