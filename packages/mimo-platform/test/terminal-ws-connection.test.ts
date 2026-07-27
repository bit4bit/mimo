import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { createWebSocketSetup } from "../src/api/websocket/handlers.js";
import { TerminalOutputBuffer } from "../src/api/websocket/terminal-output-buffer.js";

describe("Terminal WebSocket connection type", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "src", "api", "websocket", "handlers.ts"),
    "utf-8",
  );

  it("handles the terminal WebSocket upgrade path", () => {
    expect(source.includes(`type === "terminal"`)).toBe(true);
    expect(source.includes('connectionType: "terminal"')).toBe(true);
  });

  it("parses sessionId and terminalId from the path", () => {
    expect(source.includes('url.pathname.split("/")[4]')).toBe(true);
    expect(source.includes("Missing sessionId or terminalId")).toBe(true);
  });

  it("stores terminal WebSocket connections keyed by sessionId:terminalId", () => {
    expect(source.includes("terminalSessions")).toBe(true);
    expect(source.includes("`${sessionId}:${terminalId}`")).toBe(true);
  });

  it("verifies cookie token for terminal WebSocket", () => {
    const terminalSection = source.slice(
      source.indexOf('if (type === "terminal")'),
      source.indexOf('return new Response("Unknown WebSocket endpoint"'),
    );
    expect(terminalSection.includes("token")).toBe(true);
    expect(terminalSection.includes("verifyToken")).toBe(true);
    expect(terminalSection.includes("session.owner")).toBe(true);
  });

  it("handles binary stdin frames in the message handler for terminal connections", () => {
    expect(source.includes('connectionType === "terminal"')).toBe(true);
    expect(source.includes("terminal_input")).toBe(true);
    expect(source.includes("base64")).toBe(true);
  });

  it("cleans up terminal connections on close", () => {
    expect(source.includes('connectionType === "terminal"')).toBe(true);
    const closeSection = source.slice(source.indexOf("async close(ws: any)"));
    expect(closeSection.includes("terminalSessions")).toBe(true);
  });

  it("replays buffered terminal output to a newly connected client", async () => {
    const terminalOutputBuffer = new TerminalOutputBuffer();
    const sessionId = "session-1";
    const terminalId = "term-1";
    terminalOutputBuffer.append(sessionId, terminalId, Buffer.from("$ "));

    const sent: any[] = [];
    const ws = {
      data: {
        url: `http://localhost/ws/terminal/${sessionId}/${terminalId}`,
      },
      send: (data: any) => sent.push(data),
    };

    const setup = createWebSocketSetup({
      sessionRepository: {} as any,
      agentService: {} as any,
      agentRouter: {} as any,
      pipeline: {} as any,
      chatSessions: new Map(),
      fileWatchSessions: new Map(),
      terminalSessions: new Map(),
      terminalOutputBuffer,
      calculatingSessions: new Set(),
      sccService: {} as any,
      impactCalculator: {} as any,
      chatService: {} as any,
      fileWatcher: {} as any,
      fileService: {} as any,
      authService: {} as any,
    });

    await setup.websocket.open(ws);

    expect(sent.length).toBe(1);
    expect(Buffer.from(sent[0]).toString()).toBe("$ ");
  });

  it("does not send replay when the buffer is empty", async () => {
    const terminalOutputBuffer = new TerminalOutputBuffer();
    const sessionId = "session-1";
    const terminalId = "term-1";

    const sent: any[] = [];
    const ws = {
      data: {
        url: `http://localhost/ws/terminal/${sessionId}/${terminalId}`,
      },
      send: (data: any) => sent.push(data),
    };

    const setup = createWebSocketSetup({
      sessionRepository: {} as any,
      agentService: {} as any,
      agentRouter: {} as any,
      pipeline: {} as any,
      chatSessions: new Map(),
      fileWatchSessions: new Map(),
      terminalSessions: new Map(),
      terminalOutputBuffer,
      calculatingSessions: new Set(),
      sccService: {} as any,
      impactCalculator: {} as any,
      chatService: {} as any,
      fileWatcher: {} as any,
      fileService: {} as any,
      authService: {} as any,
    });

    await setup.websocket.open(ws);

    expect(sent.length).toBe(0);
  });
});
