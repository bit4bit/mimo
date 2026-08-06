// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for the pinned-sessions internal API.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "../index.js";
import { createMimoContext } from "../../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../../infrastructure/os/mock-adapter.js";

const BASE = "http://localhost:3000/api/internal/users";

function authed(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

describe("Pinned Sessions Internal API", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let user1Token: string;
  let user2Token: string;
  let testProjectId: string;
  let testSessionId: string;

  beforeAll(async () => {
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-pinned-sessions-api",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-pins-api",
        MIMO_INTERNAL_VCS_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    mockOS.fs.seed({
      "/tmp/test-mimo-pins-api": null,
      "/tmp/test-mimo-pins-api/users": null,
      "/tmp/test-mimo-pins-api/projects": null,
      "/tmp/test-mimo-pins-api/agents": null,
      "/tmp/test-mimo-pins-api/mcp-servers": null,
      "/tmp/test-mimo-pins-api/session-repos": null,
    });

    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-pinned-sessions-api",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo-pins-api",
        MIMO_VCS_REPOS_DIR: "/tmp/test-mimo-pins-api/session-repos",
        MIMO_INTERNAL_VCS_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    user1Token = await mimoContext.services.auth.generateToken("user1");
    user2Token = await mimoContext.services.auth.generateToken("user2");

    const project = await mimoContext.repos.projects.create({
      repositories: [{ id: "default", name: "default", repoUrl: "https://github.com/test/pin", repoType: "git", mountPath: "." }],

      name: "Pin Test Project",
      owner: "user1",
    });
    testProjectId = project.id;

    const session = await mimoContext.repos.sessions.create({
      name: "Pinned Session",
      projectId: testProjectId,
      owner: "user1",
    });
    testSessionId = session.id;

    app = new Hono();
    app.route("/api/internal", createInternalApiRouter(mimoContext));
  });

  let mockOS: MockOS;

  describe("Auth", () => {
    it("rejects unauthenticated GET", async () => {
      const res = await app.fetch(new Request(`${BASE}/user1/pinned-sessions`));
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST", async () => {
      const res = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, {
          method: "POST",
          body: JSON.stringify({ sessionId: "x", projectId: "y" }),
        }),
      );
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated DELETE", async () => {
      const res = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions/x`, { method: "DELETE" }),
      );
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated PUT", async () => {
      const res = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, {
          method: "PUT",
          body: JSON.stringify({ order: [] }),
        }),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("List", () => {
    it("returns an empty list when no pins exist", async () => {
      const res = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, authed(user1Token)),
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.pins).toEqual([]);
    });

    it("filters by ?group= (case-insensitive)", async () => {
      const token = await mimoContext.services.auth.generateToken("filteruser");
      const s1 = await mimoContext.repos.sessions.create({
        name: "Filter S1",
        projectId: testProjectId,
        owner: "user1",
      });
      const s2 = await mimoContext.repos.sessions.create({
        name: "Filter S2",
        projectId: testProjectId,
        owner: "user1",
      });
      const s3 = await mimoContext.repos.sessions.create({
        name: "Filter S3",
        projectId: testProjectId,
        owner: "user1",
      });
      const s4 = await mimoContext.repos.sessions.create({
        name: "Filter S4",
        projectId: testProjectId,
        owner: "user1",
      });
      const posts: Promise<Response>[] = [
        [s1, "client-x"],
        [s2, "client-x"],
        [s3, "docs"],
        [s4, "Ungrouped"],
      ].map(([s, group]) =>
        app.fetch(
          new Request(`${BASE}/filteruser/pinned-sessions`, {
            method: "POST",
            ...authed(token),
            body: JSON.stringify({
              sessionId: (s as { id: string }).id,
              projectId: testProjectId,
              group: group as string,
            }),
          }),
        ),
      );
      await Promise.all(posts);
      const res = await app.fetch(
        new Request(
          `${BASE}/filteruser/pinned-sessions?group=client-x`,
          authed(token),
        ),
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(
        json.data.pins
          .map((p: { sessionId: string }) => p.sessionId)
          .sort(),
      ).toEqual([s1.id, s2.id].sort());
      // Also confirm case-insensitive matching.
      const upper = await app.fetch(
        new Request(
          `${BASE}/filteruser/pinned-sessions?group=Client-X`,
          authed(token),
        ),
      );
      const upperJson = await upper.json();
      expect(upperJson.data.pins).toHaveLength(2);
    });

    it("returns all entries when ?group= is absent", async () => {
      const token = await mimoContext.services.auth.generateToken("nofilter");
      const s1 = await mimoContext.repos.sessions.create({
        name: "NoFilter S1",
        projectId: testProjectId,
        owner: "user1",
      });
      const s2 = await mimoContext.repos.sessions.create({
        name: "NoFilter S2",
        projectId: testProjectId,
        owner: "user1",
      });
      await app.fetch(
        new Request(`${BASE}/nofilter/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: s1.id,
            projectId: testProjectId,
            group: "client-x",
          }),
        }),
      );
      await app.fetch(
        new Request(`${BASE}/nofilter/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: s2.id,
            projectId: testProjectId,
            group: "docs",
          }),
        }),
      );
      const res = await app.fetch(
        new Request(`${BASE}/nofilter/pinned-sessions`, authed(token)),
      );
      const json = await res.json();
      expect(json.data.pins).toHaveLength(2);
    });
  });

  describe("Create", () => {
    it("rejects missing fields with 400", async () => {
      const res = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, {
          method: "POST",
          ...authed(user1Token),
          body: JSON.stringify({ sessionId: testSessionId }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it("creates a pin and resolves title/branch", async () => {
      const res = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, {
          method: "POST",
          ...authed(user1Token),
          body: JSON.stringify({
            sessionId: testSessionId,
            projectId: testProjectId,
          }),
        }),
      );
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.pins).toHaveLength(1);
      expect(json.data.pins[0]).toMatchObject({
        sessionId: testSessionId,
        projectId: testProjectId,
        sessionTitle: "Pinned Session",
        stale: false,
      });
    });

    it("moves an existing pin to the front on re-add", async () => {
      // Add a second session to pin in front of the first.
      const session2 = await mimoContext.repos.sessions.create({
        name: "Second Session",
        projectId: testProjectId,
        owner: "user1",
      });
      await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, {
          method: "POST",
          ...authed(user1Token),
          body: JSON.stringify({
            sessionId: session2.id,
            projectId: testProjectId,
          }),
        }),
      );
      // Re-add the first session — should move to front.
      const res = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, {
          method: "POST",
          ...authed(user1Token),
          body: JSON.stringify({
            sessionId: testSessionId,
            projectId: testProjectId,
          }),
        }),
      );
      const json = await res.json();
      expect(json.data.pins[0].sessionId).toBe(testSessionId);
      expect(json.data.pins).toHaveLength(2);
    });

    it("returns 409 with pin_limit_reached when capping at 5", async () => {
      // user2 is clean; pin 5 distinct sessions, then attempt a 6th.
      const sessions: { id: string }[] = [];
      for (let i = 0; i < 6; i++) {
        const s = await mimoContext.repos.sessions.create({
          name: `Cap Session ${i}`,
          projectId: testProjectId,
          owner: "user1",
        });
        sessions.push({ id: s.id });
      }
      for (let i = 0; i < 5; i++) {
        await app.fetch(
          new Request(`${BASE}/user2/pinned-sessions`, {
            method: "POST",
            ...authed(user2Token),
            body: JSON.stringify({
              sessionId: sessions[i].id,
              projectId: testProjectId,
            }),
          }),
        );
      }
      const overRes = await app.fetch(
        new Request(`${BASE}/user2/pinned-sessions`, {
          method: "POST",
          ...authed(user2Token),
          body: JSON.stringify({
            sessionId: sessions[5].id,
            projectId: testProjectId,
          }),
        }),
      );
      const overJson = await overRes.json();
      expect(overRes.status).toBe(409);
      expect(overJson.error).toBe("pin_limit_reached");
      expect(overJson.limit).toBe(5);
      // Pin store unchanged
      const listRes = await app.fetch(
        new Request(`${BASE}/user2/pinned-sessions`, authed(user2Token)),
      );
      const listJson = await listRes.json();
      expect(listJson.data.pins).toHaveLength(5);
      expect(
        listJson.data.pins.some(
          (p: { sessionId: string }) => p.sessionId === sessions[5].id,
        ),
      ).toBe(false);
    });

    it("tolerates stale pin entries on GET", async () => {
      // Pin a session that doesn't exist on disk.
      const res = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, {
          method: "POST",
          ...authed(user1Token),
          body: JSON.stringify({
            sessionId: "ghost-session-id",
            projectId: testProjectId,
          }),
        }),
      );
      const json = await res.json();
      const stale = json.data.pins.find(
        (p: { sessionId: string }) => p.sessionId === "ghost-session-id",
      );
      expect(stale).toBeDefined();
      expect(stale.stale).toBe(true);
      expect(stale.sessionTitle).toBeNull();
      expect(stale.branch).toBeNull();
      expect(stale.group).toBe("Ungrouped");
    });

    it("stores an explicit group and returns it on list", async () => {
      const token = await mimoContext.services.auth.generateToken("groupuser");
      const s = await mimoContext.repos.sessions.create({
        name: "Grouped Session",
        projectId: testProjectId,
        owner: "user1",
      });
      const createRes = await app.fetch(
        new Request(`${BASE}/groupuser/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: s.id,
            projectId: testProjectId,
            group: "client-x",
          }),
        }),
      );
      const createJson = await createRes.json();
      expect(createRes.status).toBe(201);
      expect(createJson.data.pins[0].group).toBe("client-x");
      expect(createJson.data.pins[0].sessionId).toBe(s.id);
    });

    it("defaults the group to 'Ungrouped' when omitted", async () => {
      const token = await mimoContext.services.auth.generateToken("defaultuser");
      const s = await mimoContext.repos.sessions.create({
        name: "Default Group Session",
        projectId: testProjectId,
        owner: "user1",
      });
      const res = await app.fetch(
        new Request(`${BASE}/defaultuser/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: s.id,
            projectId: testProjectId,
          }),
        }),
      );
      const json = await res.json();
      expect(json.data.pins[0].group).toBe("Ungrouped");
    });

    it("rejects a non-string or empty group with 400", async () => {
      const token = await mimoContext.services.auth.generateToken("invalidgroup");
      const res = await app.fetch(
        new Request(`${BASE}/invalidgroup/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: testSessionId,
            projectId: testProjectId,
            group: "   ",
          }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it("allows the same session in two different groups", async () => {
      const token = await mimoContext.services.auth.generateToken("twogroupuser");
      const s = await mimoContext.repos.sessions.create({
        name: "Two Group Session",
        projectId: testProjectId,
        owner: "user1",
      });
      await app.fetch(
        new Request(`${BASE}/twogroupuser/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: s.id,
            projectId: testProjectId,
            group: "client-x",
          }),
        }),
      );
      await app.fetch(
        new Request(`${BASE}/twogroupuser/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: s.id,
            projectId: testProjectId,
            group: "docs",
          }),
        }),
      );
      const listRes = await app.fetch(
        new Request(`${BASE}/twogroupuser/pinned-sessions`, authed(token)),
      );
      const listJson = await listRes.json();
      const entries = listJson.data.pins.filter(
        (p: { sessionId: string }) => p.sessionId === s.id,
      );
      expect(entries).toHaveLength(2);
      const groups = entries
        .map((e: { group: string }) => e.group)
        .sort();
      expect(groups).toEqual(["client-x", "docs"]);
    });
  });

  describe("Delete", () => {
    it("removes a pin and returns 204", async () => {
      const s = await mimoContext.repos.sessions.create({
        name: "Delete Pin Session",
        projectId: testProjectId,
        owner: "user1",
      });
      await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, {
          method: "POST",
          ...authed(user1Token),
          body: JSON.stringify({
            sessionId: s.id,
            projectId: testProjectId,
          }),
        }),
      );
      const del = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions/${s.id}`, {
          method: "DELETE",
          ...authed(user1Token),
        }),
      );
      expect(del.status).toBe(204);
      const list = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, authed(user1Token)),
      );
      const listJson = await list.json();
      expect(
        listJson.data.pins.some(
          (p: { sessionId: string }) => p.sessionId === s.id,
        ),
      ).toBe(false);
    });

    it("removes only the matching (sessionId, group) when ?group= is supplied", async () => {
      const token = await mimoContext.services.auth.generateToken("delgroupuser");
      const s = await mimoContext.repos.sessions.create({
        name: "GroupDelete Session",
        projectId: testProjectId,
        owner: "user1",
      });
      await app.fetch(
        new Request(`${BASE}/delgroupuser/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: s.id,
            projectId: testProjectId,
            group: "client-x",
          }),
        }),
      );
      await app.fetch(
        new Request(`${BASE}/delgroupuser/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: s.id,
            projectId: testProjectId,
            group: "docs",
          }),
        }),
      );
      const del = await app.fetch(
        new Request(
          `${BASE}/delgroupuser/pinned-sessions/${s.id}?group=client-x`,
          { method: "DELETE", ...authed(token) },
        ),
      );
      expect(del.status).toBe(204);
      const list = await app.fetch(
        new Request(`${BASE}/delgroupuser/pinned-sessions`, authed(token)),
      );
      const listJson = await list.json();
      const remaining = listJson.data.pins.filter(
        (p: { sessionId: string }) => p.sessionId === s.id,
      );
      expect(remaining).toHaveLength(1);
      expect(remaining[0].group).toBe("docs");
    });

    it("removes all entries for a sessionId when ?group= is absent", async () => {
      const token = await mimoContext.services.auth.generateToken("delalluser");
      const s = await mimoContext.repos.sessions.create({
        name: "DeleteAll Session",
        projectId: testProjectId,
        owner: "user1",
      });
      await app.fetch(
        new Request(`${BASE}/delalluser/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: s.id,
            projectId: testProjectId,
            group: "client-x",
          }),
        }),
      );
      await app.fetch(
        new Request(`${BASE}/delalluser/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({
            sessionId: s.id,
            projectId: testProjectId,
            group: "docs",
          }),
        }),
      );
      const del = await app.fetch(
        new Request(`${BASE}/delalluser/pinned-sessions/${s.id}`, {
          method: "DELETE",
          ...authed(token),
        }),
      );
      expect(del.status).toBe(204);
      const list = await app.fetch(
        new Request(`${BASE}/delalluser/pinned-sessions`, authed(token)),
      );
      const listJson = await list.json();
      expect(listJson.data.pins).toHaveLength(0);
    });
  });

  describe("Reorder", () => {
    it("rejects when order does not match current pins", async () => {
      const res = await app.fetch(
        new Request(`${BASE}/user1/pinned-sessions`, {
          method: "PUT",
          ...authed(user1Token),
          body: JSON.stringify({ order: ["nonexistent"] }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rewrites the order of the user's pins", async () => {
      // Use a clean user.
      const token = await mimoContext.services.auth.generateToken("reorderer");
      const s1 = await mimoContext.repos.sessions.create({
        name: "Reorder A",
        projectId: testProjectId,
        owner: "user1",
      });
      const s2 = await mimoContext.repos.sessions.create({
        name: "Reorder B",
        projectId: testProjectId,
        owner: "user1",
      });
      await app.fetch(
        new Request(`${BASE}/reorderer/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({ sessionId: s1.id, projectId: testProjectId }),
        }),
      );
      await app.fetch(
        new Request(`${BASE}/reorderer/pinned-sessions`, {
          method: "POST",
          ...authed(token),
          body: JSON.stringify({ sessionId: s2.id, projectId: testProjectId }),
        }),
      );
      // Now s2 is in front; reorder to [s1, s2].
      const res = await app.fetch(
        new Request(`${BASE}/reorderer/pinned-sessions`, {
          method: "PUT",
          ...authed(token),
          body: JSON.stringify({ order: [s1.id, s2.id] }),
        }),
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.pins.map((p: { sessionId: string }) => p.sessionId)).toEqual([
        s1.id,
        s2.id,
      ]);
    });
  });

  describe("Isolation", () => {
    it("user2 cannot see user1's pins", async () => {
      const res = await app.fetch(
        new Request(`${BASE}/user2/pinned-sessions`, authed(user2Token)),
      );
      const json = await res.json();
      expect(
        json.data.pins.some(
          (p: { sessionId: string }) => p.sessionId === testSessionId,
        ),
      ).toBe(false);
    });
  });
});