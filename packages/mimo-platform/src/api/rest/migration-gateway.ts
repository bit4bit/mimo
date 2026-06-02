// SPDX-License-Identifier: AGPL-3.0-only
import type { MiddlewareHandler } from "hono";
import type { MimoContext } from "../../infrastructure/context/mimo-context.js";

export interface MigratedInternalApiRoute {
  method: string;
  path: string;
}

export const migratedInternalApiRoutes: MigratedInternalApiRoute[] = [
  { method: "POST", path: "/auth/login" },
];

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export interface MigrationGatewayOptions {
  fetchFn?: typeof fetch;
}

function internalPathFor(requestPath: string): string {
  if (requestPath === "/api/internal") return "/";
  if (requestPath.startsWith("/api/internal/")) {
    return requestPath.slice("/api/internal".length);
  }
  return requestPath;
}

function isMigratedRoute(method: string, path: string): boolean {
  return migratedInternalApiRoutes.some(
    (route) => route.method === method.toUpperCase() && route.path === path,
  );
}

function responseHeadersFrom(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

export function createInternalApiMigrationGateway(
  mimoContext: Pick<MimoContext, "env">,
  options: MigrationGatewayOptions = {},
): MiddlewareHandler {
  const fetchFn = options.fetchFn ?? fetch;

  return async (c, next) => {
    const internalPath = internalPathFor(c.req.path);

    if (!isMigratedRoute(c.req.method, internalPath)) {
      await next();
      return;
    }

    const platformV2Url = mimoContext.env.PLATFORM_V2_URL;
    if (!platformV2Url) {
      return c.json(
        {
          success: false,
          error: "Authentication service unavailable",
          code: 503,
        },
        503,
      );
    }

    const sourceUrl = new URL(c.req.url);
    const upstreamUrl = new URL(
      `/api/internal${internalPath}${sourceUrl.search}`,
      platformV2Url,
    );
    const hasBody = !["GET", "HEAD"].includes(c.req.method.toUpperCase());
    const body = hasBody ? await c.req.arrayBuffer() : undefined;

    try {
      const upstream = await fetchFn(upstreamUrl.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body,
        redirect: "manual",
      });
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeadersFrom(upstream),
      });
    } catch {
      return c.json(
        {
          success: false,
          error: "Authentication service unavailable",
          code: 503,
        },
        503,
      );
    }
  };
}
