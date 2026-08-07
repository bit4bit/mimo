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
 * Returns the distinct group labels from a pin list, deduped
 * case-insensitively (first-seen casing preserved), sorted.
 */
function distinctGroups(pins: PinListEntryResponse[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of pins) {
    const key = (p.group ?? "").toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p.group);
    }
  }
  result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return result;
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

    // The chip set is derived from the user's full pin list (every group
    // with at least one entry appears as a chip). The `?group=` query
    // filters the columns; when present we call the filter endpoint, when
    // absent we list everything.
    const allResult = await apiClient.get<PinListResponse>(
      `/users/${username}/pinned-sessions`,
    );
    const allPins: PinListEntryResponse[] = allResult.success
      ? allResult.data.pins
      : [];

    const groupParam = c.req.query("group") ?? null;
    const hasGroupFilter = groupParam !== null && groupParam.length > 0;

    let pins: PinListEntryResponse[] = allPins;
    if (hasGroupFilter) {
      const filteredResult = await apiClient.get<PinListResponse>(
        `/users/${username}/pinned-sessions?group=${encodeURIComponent(groupParam)}`,
      );
      pins = filteredResult.success ? filteredResult.data.pins : [];
    }

    // `?ids=sid1,sid2,...` carries the drawer's selection. When present
    // and no group filter is active, render only the listed session ids
    // (in the supplied order); pins not listed are omitted. When `?ids=`
    // is absent entirely, fall back to the full pin set (backward compat).
    // Empty `?ids=` (explicitly blank) is a selection of zero sessions and
    // triggers the selection-required state.
    //
    // When a group filter is active, `?ids=` is ignored: the user clicked
    // a chip expecting "show me all pins in this group", and applying the
    // drawer selection on top would land them on the empty state for any
    // group whose pins weren't all selected in the drawer. The chips
    // themselves drop `?ids=` from their hrefs so the URL is clean after
    // the click.
    const rawIds = c.req.query("ids") ?? null;
    const idsParam = hasGroupFilter ? null : rawIds;
    if (idsParam !== null) {
      const ids = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const byId = new Map(pins.map((p) => [p.sessionId, p] as const));
      pins = ids
        .map((id) => byId.get(id) ?? null)
        .filter((p): p is PinListEntryResponse => p !== null);
    }

    return c.html(
      <PinnedParallelPage
        pins={pins}
        hasPins={allPins.length > 0}
        selectionProvided={idsParam !== null}
        groups={distinctGroups(allPins)}
        activeGroup={groupParam}
      />,
    );
  });

  return router;
}
