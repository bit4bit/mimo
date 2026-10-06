// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";

import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";
import type {
  ContentSearchResponse,
  SearchOptions,
  SearchService,
} from "../src/domain/files/types.js";

function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");

  const app = new Hono();
  app.route("/api/internal", createInternalApiRouter(ctx));
  const sessions = createSessionsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        return app.request(new URL(urlStr).pathname, init);
      }
      return fetch(url, init);
    },
  });
  app.route("/sessions", sessions);
  return app;
}

describe("GET /sessions/:id/search context params", () => {
  let app: Hono;
  let token: string;
  let sessionId: string;
  let received: SearchOptions[];
  let response: ContentSearchResponse;

  beforeEach(async () => {
    received = [];
    response = { results: [], truncated: false };
    const search: SearchService = {
      searchContent: async (_ws, _q, options) => {
        received.push(options);
        return response;
      },
    };

    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: {
        MIMO_HOME: join(
          tmpdir(),
          `mimo-content-search-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ),
        JWT_SECRET: "test-secret-key-for-testing",
      },
      services: { sharedVcs: new DummyGitHttpServer(), search },
    } as any);

    await ctx.repos.users.create(
      "testuser",
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 4 }),
    );
    const project = await ctx.repos.projects.create({
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/user/repo.git",
          repoType: "git",
          mountPath: ".",
        },
      ],
      name: "Test Project",
      owner: "testuser",
    });
    const session = await ctx.repos.sessions.create({
      name: "Search Session",
      projectId: project.id,
      owner: "testuser",
    });
    sessionId = session.id;
    token = await ctx.services.auth.generateToken("testuser");
    app = createTestApp(ctx);
  });

  const search = (params: string) =>
    app.request(`/sessions/${sessionId}/search?q=foo${params}`, {
      headers: { Cookie: `token=${token}` },
    });

  it("searches with separate before and after values", async () => {
    const res = await search("&before=1&after=3");

    expect(res.status).toBe(200);
    expect(received[0]).toMatchObject({ beforeLines: 1, afterLines: 3 });
  });

  it("uses the legacy context value for both sides", async () => {
    await search("&context=4");

    expect(received[0]).toMatchObject({ beforeLines: 4, afterLines: 4 });
  });

  it("defaults to two lines on each side", async () => {
    await search("");

    expect(received[0]).toMatchObject({ beforeLines: 2, afterLines: 2 });
  });

  it("clamps out-of-range values and falls back on invalid ones", async () => {
    await search("&before=50&after=abc");
    await search("&before=-3&after=0");

    expect(received[0]).toMatchObject({ beforeLines: 10, afterLines: 2 });
    expect(received[1]).toMatchObject({ beforeLines: 0, afterLines: 0 });
  });

  it("reports truncation from the search service", async () => {
    response = {
      results: [
        {
          path: "a.txt",
          line: 1,
          column: 0,
          text: "foo",
          matchStart: 0,
          matchEnd: 3,
          before: [],
          after: [],
        },
      ],
      truncated: true,
    };

    const body = await (await search("")).json();

    expect(body).toMatchObject({ total: 1, uniqueFiles: 1, truncated: true });
    expect(body.results).toHaveLength(1);
  });
});
