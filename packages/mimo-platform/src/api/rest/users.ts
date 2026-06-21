// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Router for user-related internal API endpoints.
 *
 * Currently provides username search to back the agent-sharing autocomplete.
 * Mounted under /api/internal/users.
 */

import { Hono } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";
import { successResponse, errorResponse } from "./shared/response.js";
import type { InternalApiContext } from "./shared/types.js";

/** Maximum number of suggestions returned by the search endpoint. */
const SEARCH_LIMIT = 10;

/**
 * Search usernames for sharing autocomplete.
 * GET /api/internal/users/search?q=<query>&agentId=<id>
 *
 * Excludes the requesting user and, when agentId is supplied and owned by the
 * requester, users already shared on that agent.
 */
export async function searchUsersHandler(
  c: InternalApiContext,
): Promise<Response> {
  const user = c.get("user") as { username: string } | undefined;
  if (!user) {
    return c.json(errorResponse("Unauthorized", 401), 401);
  }

  const mimoContext = c.get("mimoContext");
  const query = (c.req.query("q") ?? "").trim().toLowerCase();
  const agentId = c.req.query("agentId");

  const excluded = new Set<string>([user.username]);
  if (agentId) {
    const agent = await mimoContext.repos.agents.findById(agentId);
    if (agent && agent.owner === user.username) {
      for (const grant of agent.sharedWith) {
        excluded.add(grant.username);
      }
    }
  }

  const users = await mimoContext.repos.users.listUsers();
  const matches = users
    .filter((u) => !excluded.has(u.username))
    .filter((u) => u.username.toLowerCase().includes(query))
    .slice(0, SEARCH_LIMIT)
    .map((u) => ({ username: u.username }));

  return c.json(successResponse({ users: matches }));
}

export function createUsersInternalRouter(_mimoContext: MimoContext): Hono {
  const router = new Hono();

  router.get("/search", searchUsersHandler);

  return router;
}
