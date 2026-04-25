/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import type { Context } from "hono";
import type { MimoContext } from "../context/mimo-context.js";
import { ChatService } from "../sessions/chat.js";
import { defaultSummaryPrompt } from "../config/service.js";

type SummaryRoutesContext = Pick<MimoContext, "services" | "repos">;

export function createSummaryRoutes(mimoContext: SummaryRoutesContext) {
  const router = new Hono();
  const agentService = mimoContext.services.agents;
  const chatService = mimoContext.services.chat;
  const configService = mimoContext.services.config;
  const sessionRepository = mimoContext.repos.sessions;

  async function getAuthUsername(c: Context): Promise<string | null> {
    const cookieHeader = c.req.header("Cookie");
    const usernameMatch = cookieHeader?.match(/username=([^;]+)/);
    return usernameMatch ? usernameMatch[1] : null;
  }

  async function getSession(sessionId: string) {
    return sessionRepository.findById(sessionId);
  }

  function getSessionId(c: Context): string | null {
    return c.req.query("sessionId");
  }

  function stripThoughtProcess(content: string): string {
    // Remove <details><summary>Thought Process</summary>...</details> block
    const thoughtRegex =
      /<details><summary>Thought Process<\/summary>[\s\S]*?<\/details>\s*\n?\n?/g;
    return content.replace(thoughtRegex, "").trim();
  }

  function findThreadInSession(
    session: any,
    threadId: string,
  ): { id: string; assignedAgentId?: string } | null {
    if (!session.chatThreads) return null;
    return session.chatThreads.find((t: any) => t.id === threadId) || null;
  }

  function getThreadAgentId(session: any, threadId: string): string | null {
    const thread = findThreadInSession(session, threadId);
    return thread?.assignedAgentId || null;
  }

  function isAgentConnected(agentId: string): boolean {
    const ws = agentService.getAgentConnection(agentId);
    return ws !== undefined && ws.readyState === 1;
  }

  router.post("/refresh", async (c: Context) => {
    console.log("SUMMARY REFRESH ENDPOINT HIT");
    const body = await c.req.parseBody();
    console.log("Body:", body);

    const username = await getAuthUsername(c);
    console.log("Username:", username);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = getSessionId(c);
    console.log("SessionId:", sessionId);
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    const session = await getSession(sessionId);
    console.log("Session:", session ? "found" : "not found");

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const analyzeThreadId = body.analyzeThreadId as string;
    const summarizeThreadId = body.summarizeThreadId as string;
    console.log("analyzeThreadId:", analyzeThreadId);
    console.log("summarizeThreadId:", summarizeThreadId);

    if (!analyzeThreadId || !summarizeThreadId) {
      return c.json(
        { error: "analyzeThreadId and summarizeThreadId are required" },
        400,
      );
    }

    const summarizeAgentId = getThreadAgentId(session, summarizeThreadId);
    console.log("summarizeAgentId:", summarizeAgentId);
    console.log("session.chatThreads:", session.chatThreads);
    if (!summarizeAgentId) {
      return c.json(
        {
          error:
            "No agent assigned to summarize thread. Select a thread with an active agent.",
        },
        400,
      );
    }

    if (!isAgentConnected(summarizeAgentId)) {
      return c.json(
        { error: "Agent is not active in the summarize thread" },
        400,
      );
    }

    const history = await chatService.loadHistory(sessionId, analyzeThreadId);
    console.log("History loaded:", history.length, "messages");
    const config = configService.load();
    const summaryPrompt = config.summary?.prompt ?? defaultSummaryPrompt;
    console.log("Summary prompt:", summaryPrompt);

    if (history.length === 0) {
      return c.json(
        { error: "No messages in the selected thread to summarize" },
        400,
      );
    }

    const historyText = history
      .map((msg) => {
        const roleLabel = msg.role === "user" ? "User" : "Assistant";
        return `${roleLabel}: ${msg.content}`;
      })
      .join("\n\n");

    console.log("History text length:", historyText.length);

    const fullPrompt = `${summaryPrompt}\n\n${historyText}`;
    console.log("Full prompt:", fullPrompt.substring(0, 200), "...");

    const ws = agentService.getAgentConnection(summarizeAgentId);
    console.log("WebSocket:", ws ? "found" : "not found");
    console.log("WebSocket readyState:", ws?.readyState);

    if (!ws || ws.readyState !== 1) {
      return c.json({ error: "Agent connection lost" }, 400);
    }

    console.log("Sending user_message to agent...");
    ws.send(
      JSON.stringify({
        type: "user_message",
        sessionId: sessionId,
        chatThreadId: summarizeThreadId,
        content: fullPrompt,
      }),
    );
    console.log("Message sent!");

    // Also save the message to the chat history (like regular chat does)
    await chatService.saveMessage(
      sessionId,
      {
        role: "user",
        content: fullPrompt,
        timestamp: new Date().toISOString(),
      },
      summarizeThreadId,
    );
    console.log("Message saved to history!");

    return c.json({
      message: "Summary request sent. Check the chat thread for the result.",
      summaryThreadId: summarizeThreadId,
    });
  });

  router.get("/latest", async (c: Context) => {
    const username = await getAuthUsername(c);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = getSessionId(c);
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    const session = await getSession(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const summarizeThreadId = c.req.query("summarizeThreadId");

    if (!summarizeThreadId) {
      return c.json({ error: "summarizeThreadId is required" }, 400);
    }

    const history = await chatService.loadHistory(sessionId, summarizeThreadId);

    const assistantMessages = history.filter(
      (msg) => msg.role === "assistant" && msg.content,
    );

    if (assistantMessages.length === 0) {
      return c.json({ summary: "" });
    }

    const latestMessage = stripThoughtProcess(
      assistantMessages[assistantMessages.length - 1].content,
    );

    return c.json({ summary: latestMessage });
  });

  return router;
}
