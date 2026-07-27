// SPDX-License-Identifier: AGPL-3.0-only
/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import type { Context } from "hono";
import type { MimoContext } from "../../../../infrastructure/context/mimo-context.js";
import { createAuthMiddleware } from "../../../../auth/middleware.js";
import { createInternalApiClient } from "../../../../api/rest/index.js";
import type {
  PinListEntryResponse,
  PinListResponse,
} from "../../../../api/rest/pinned-sessions/types.js";
import { PinnedParallelPage } from "../components/PinnedParallelPage.js";

type PinnedRoutesContext = Pick<MimoContext, "services" | "repos" | "env">;

interface PinnedRoutesDeps {
  fetchFn?: typeof fetch;
}

/**
 * Creates the `/pinned` route — loads the authenticated user's pin list via
 * the internal API client and renders `PinnedParallelPage`.
 */
export function createPinnedRoutes(
  mimoContext: PinnedRoutesContext,
  deps: PinnedRoutesDeps = {},
) {
  const router = new Hono();
  const auth = createAuthMiddleware(mimoContext.services.auth);

  function createApiClient(c: Context) {
    return createInternalApiClient(c, mimoContext as MimoContext, {
      fetchFn: deps.fetchFn,
    });
  }

  router.get("/", auth, async (c: Context) => {
    const user = c.get("user") as { username: string } | undefined;
    const username = user?.username ?? "me";
    const apiClient = createApiClient(c);
    const result = await apiClient.get<PinListResponse>(
      `/users/${username}/pinned-sessions`,
    );
    const allPins: PinListEntryResponse[] = result.success
      ? result.data.pins
      : [];

    // `?ids=sid1,sid2,...` carries the drawer's selection. When present,
    // render only the listed session ids (in the supplied order); pins not
    // listed are omitted. When `?ids=` is absent entirely, fall back to the
    // full pin set (backward compat). Empty `?ids=` (explicitly blank) is a
    // selection of zero sessions and triggers the selection-required state.
    const idsParam = c.req.query("ids") ?? null;
    let pins: PinListEntryResponse[];
    if (idsParam === null) {
      pins = allPins;
    } else {
      const ids = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const byId = new Map(allPins.map((p) => [p.sessionId, p] as const));
      pins = ids
        .map((id) => byId.get(id) ?? null)
        .filter((p): p is PinListEntryResponse => p !== null);
    }
    return c.html(
      <PinnedParallelPage
        pins={pins}
        hasPins={allPins.length > 0}
        selectionProvided={idsParam !== null}
      />,
    );
  });

  return router;
}