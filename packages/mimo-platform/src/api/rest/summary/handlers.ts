/**
 * Request handlers for the summary internal API.
 *
 * Provides summary generation and retrieval operations.
 * All handlers are pure functions that operate on injected dependencies.
 */

import { successResponse, errorResponse } from "../shared/response.js";
import type { InternalApiContext } from "../shared/types.js";
import type { RefreshSummaryRequest, GetLatestSummaryQuery } from "./types.js";
import { defaultSummaryPrompt } from "../../../domain/config/service.js";

/**
 * Refresh/generate a summary for a session.
 * POST /api/internal/summary/refresh
 */
export async function refreshSummaryHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const body = (await c.req.json()) as RefreshSummaryRequest;

  // Validate required fields
  if (!body.sessionId) {
    return c.json(errorResponse("sessionId is required", 400), 400);
  }
  if (!body.analyzeThreadId) {
    return c.json(errorResponse("analyzeThreadId is required", 400), 400);
  }
  if (!body.summarizeThreadId) {
    return c.json(errorResponse("summarizeThreadId is required", 400), 400);
  }

  const { sessionId, analyzeThreadId, summarizeThreadId } = body;

  // Get session
  const session = await mimoContext.repos.sessions.findById(sessionId);
  if (!session) {
    return c.json(errorResponse("Session not found", 404), 404);
  }

  // Get the agent assigned to the summarize thread
  const summarizeAgentId = getThreadAgentId(session, summarizeThreadId);
  if (!summarizeAgentId) {
    return c.json(
      errorResponse(
        "No agent assigned to summarize thread. Select a thread with an active agent.",
        400,
      ),
      400,
    );
  }

  // Check if agent is connected
  const agentService = mimoContext.services.agents;
  const ws = agentService.getAgentConnection(summarizeAgentId);
  if (!ws || ws.readyState !== 1) {
    return c.json(
      errorResponse("Agent is not active in the summarize thread", 400),
      400,
    );
  }

  // Load chat history
  const chatService = mimoContext.services.chat;
  const history = await chatService.loadHistory(sessionId, analyzeThreadId);

  if (history.length === 0) {
    return c.json(
      errorResponse("No messages in the selected thread to summarize", 400),
      400,
    );
  }

  // Build prompt
  const configService = mimoContext.services.config;
  const config = configService.load();
  const summaryPrompt = config.summary?.prompt ?? defaultSummaryPrompt;

  const historyText = history
    .map((msg: { role: string; content: string }) => {
      const roleLabel = msg.role === "user" ? "User" : "Assistant";
      return `${roleLabel}: ${msg.content}`;
    })
    .join("\n\n");

  const fullPrompt = summaryPrompt.replace("{history}", historyText);

  // Send to agent
  ws.send(
    JSON.stringify({
      type: "user_message",
      sessionId: sessionId,
      chatThreadId: summarizeThreadId,
      content: fullPrompt,
    }),
  );

  // Save the message to chat history
  await chatService.saveMessage(
    sessionId,
    {
      role: "user",
      content: fullPrompt,
      timestamp: new Date().toISOString(),
    },
    summarizeThreadId,
  );

  return c.json(
    successResponse({
      message: "Summary request sent. Check the chat thread for the result.",
      summaryThreadId: summarizeThreadId,
    }),
  );
}

/**
 * Get the latest summary for a session.
 * GET /api/internal/summary/latest
 */
export async function getLatestSummaryHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const query = c.req.query();

  // Validate required fields
  if (!query.sessionId) {
    return c.json(errorResponse("sessionId is required", 400), 400);
  }
  if (!query.summarizeThreadId) {
    return c.json(errorResponse("summarizeThreadId is required", 400), 400);
  }

  const sessionId = query.sessionId;
  const summarizeThreadId = query.summarizeThreadId;

  // Get session
  const session = await mimoContext.repos.sessions.findById(sessionId);
  if (!session) {
    return c.json(errorResponse("Session not found", 404), 404);
  }

  // Load chat history
  const chatService = mimoContext.services.chat;
  const history = await chatService.loadHistory(sessionId, summarizeThreadId);

  // Find the latest assistant message
  const assistantMessages = history.filter(
    (msg: { role: string; content: string }) =>
      msg.role === "assistant" && msg.content,
  );

  if (assistantMessages.length === 0) {
    return c.json(successResponse({ summary: "" }));
  }

  const latestMessage = stripThoughtProcess(
    assistantMessages[assistantMessages.length - 1].content,
  );

  return c.json(successResponse({ summary: latestMessage }));
}

/**
 * Helper function to get the agent ID assigned to a thread.
 */
function getThreadAgentId(session: any, threadId: string): string | null {
  if (!session.chatThreads) return null;
  const thread = session.chatThreads.find((t: any) => t.id === threadId);
  return thread?.assignedAgentId || null;
}

/**
 * Strip thought process blocks from content.
 * Removes <details><summary>Thought Process</summary>...</details> blocks.
 */
function stripThoughtProcess(content: string): string {
  const thoughtRegex =
    /<details><summary>Thought Process<\/summary>[\s\S]*?<\/details>\s*\n?\n?/g;
  return content.replace(thoughtRegex, "").trim();
}
