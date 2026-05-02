/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import type { Context } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import { createInternalApiClient } from "../../api/rest/index.js";

type SummaryRoutesContext = Pick<MimoContext, "services" | "repos" | "env">;

// Helper to get authenticated username
async function getAuthUsername(
  c: Context,
  mimoContext: MimoContext,
): Promise<string | null> {
  const cookieHeader = c.req.header("Cookie");
  const usernameMatch = cookieHeader?.match(/username=([^;]+)/);
  const username = usernameMatch ? usernameMatch[1] : null;
  if (username) return username;

  const tokenMatch = cookieHeader?.match(/token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (token) {
    const payload = await mimoContext.services.auth.verifyToken(token);
    if (payload) return payload.username;
  }

  return null;
}

export function createSummaryRoutes(mimoContext: SummaryRoutesContext) {
  const router = new Hono();
  const sessionRepository = mimoContext.repos.sessions;

  function getSessionId(c: Context): string | null {
    return c.req.query("sessionId");
  }

  router.post("/refresh", async (c: Context) => {
    console.log("SUMMARY REFRESH ENDPOINT HIT");
    const body = await c.req.parseBody();
    console.log("Body:", body);

    const username = await getAuthUsername(c, mimoContext as MimoContext);
    console.log("Username:", username);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = getSessionId(c);
    console.log("SessionId:", sessionId);
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    const session = await sessionRepository.findById(sessionId);
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

    // Use internal API client
    const apiClient = createInternalApiClient(c, mimoContext as MimoContext);
    const result = await apiClient.post<{ requested: boolean }>(
      "/summary/refresh",
      {
        sessionId,
        analyzeThreadId,
        summarizeThreadId,
      },
    );

    if (!result.success) {
      return c.json({ error: result.error }, result.status as 400 | 401 | 404);
    }

    return c.json({ requested: result.data.requested });
  });

  router.get("/latest", async (c: Context) => {
    const username = await getAuthUsername(c, mimoContext as MimoContext);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sessionId = getSessionId(c);
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    const session = await sessionRepository.findById(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const summarizeThreadId = c.req.query("summarizeThreadId");

    if (!summarizeThreadId) {
      return c.json({ error: "summarizeThreadId is required" }, 400);
    }

    // Use internal API client
    const apiClient = createInternalApiClient(c, mimoContext as MimoContext);
    const result = await apiClient.get<unknown>(
      `/summary/latest?sessionId=${encodeURIComponent(sessionId)}&summarizeThreadId=${encodeURIComponent(summarizeThreadId)}`,
    );

    if (!result.success) {
      return c.json({ error: result.error }, result.status as 400 | 401 | 404);
    }

    return c.json(result.data);
  });

  return router;
}
