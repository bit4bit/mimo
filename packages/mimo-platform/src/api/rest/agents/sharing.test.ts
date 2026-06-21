// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for agent sharing.
 *
 * Covers: listing union (owned + shared), share/revoke endpoints (owner-only),
 * user search autocomplete, and the read-only shared-agent detail view.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { createInternalApiRouter } from "../index.js";
import { createMimoContext } from "../../../infrastructure/context/mimo-context.js";
import { createMockOS } from "../../../infrastructure/os/mock-adapter.js";
import type { MockOS } from "../../../infrastructure/os/mock-adapter.js";

describe("Agent Sharing", () => {
  let app: Hono;
  let mimoContext: ReturnType<typeof createMimoContext>;
  let mockOS: MockOS;
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;

  beforeEach(async () => {
    mockOS = createMockOS({
      env: {
        JWT_SECRET: "test-jwt-secret-for-agent-sharing",
        PORT: "3000",
        MIMO_HOME: "/tmp/test-mimo-sharing",
        MIMO_INTERNAL_VCS_PORT: "8000",
        MIMO_HOST: "localhost",
      },
      homeDir: "/home/test",
    }) as MockOS;

    mockOS.fs.seed({
      "/tmp/test-mimo-sharing": null,
      "/tmp/test-mimo-sharing/users": null,
      "/tmp/test-mimo-sharing/projects": null,
      "/tmp/test-mimo-sharing/agents": null,
      "/tmp/test-mimo-sharing/mcp-servers": null,
      "/tmp/test-mimo-sharing/session-repos": null,
    });

    mimoContext = createMimoContext({
      env: {
        JWT_SECRET: "test-jwt-secret-for-agent-sharing",
        PORT: 3000,
        PLATFORM_URL: "http://localhost:3000",
        MIMO_HOME: "/tmp/test-mimo-sharing",
        MIMO_VCS_REPOS_DIR: "/tmp/test-mimo-sharing/session-repos",
        MIMO_INTERNAL_VCS_PORT: 8000,
        MIMO_HOST: "localhost",
      },
      os: mockOS,
    });

    // Create real users so existence checks pass.
    await mimoContext.repos.users.create("alice", "hash");
    await mimoContext.repos.users.create("bob", "hash");
    await mimoContext.repos.users.create("carol", "hash");

    aliceToken = await mimoContext.services.auth.generateToken("alice");
    bobToken = await mimoContext.services.auth.generateToken("bob");
    carolToken = await mimoContext.services.auth.generateToken("carol");

    app = new Hono();
    app.route("/api/internal", createInternalApiRouter(mimoContext));
  });

  async function createAliceAgent(name = "Alice Agent") {
    return mimoContext.services.agents.createAgent({
      name,
      owner: "alice",
      provider: "opencode",
    });
  }

  function share(token: string, agentId: string, username: string) {
    return app.fetch(
      new Request(
        `http://localhost:3000/api/internal/agents/${agentId}/shares`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username }),
        },
      ),
    );
  }

  function revoke(token: string, agentId: string, username: string) {
    return app.fetch(
      new Request(
        `http://localhost:3000/api/internal/agents/${agentId}/shares/${username}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    );
  }

  function listAgents(token: string) {
    return app.fetch(
      new Request("http://localhost:3000/api/internal/agents", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  }

  function getAgent(token: string, agentId: string) {
    return app.fetch(
      new Request(`http://localhost:3000/api/internal/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  }

  describe("Share endpoint", () => {
    it("lets the owner share with an existing user", async () => {
      const agent = await createAliceAgent();
      const res = await share(aliceToken, agent.id, "bob");
      expect(res.status).toBe(200);

      const stored = await mimoContext.repos.agents.findById(agent.id);
      expect(stored?.sharedWith).toEqual([
        { username: "bob", permission: "use" },
      ]);
    });

    it("rejects sharing with self", async () => {
      const agent = await createAliceAgent();
      const res = await share(aliceToken, agent.id, "alice");
      expect(res.status).toBe(400);
    });

    it("rejects sharing with a non-existent user", async () => {
      const agent = await createAliceAgent();
      const res = await share(aliceToken, agent.id, "ghost");
      expect(res.status).toBe(400);
    });

    it("rejects sharing with an already-shared user", async () => {
      const agent = await createAliceAgent();
      await share(aliceToken, agent.id, "bob");
      const res = await share(aliceToken, agent.id, "bob");
      expect(res.status).toBe(400);

      const stored = await mimoContext.repos.agents.findById(agent.id);
      expect(stored?.sharedWith.length).toBe(1);
    });

    it("does not let a non-owner share the agent", async () => {
      const agent = await createAliceAgent();
      const res = await share(bobToken, agent.id, "carol");
      expect(res.status).toBe(404);

      const stored = await mimoContext.repos.agents.findById(agent.id);
      expect(stored?.sharedWith).toEqual([]);
    });
  });

  describe("Revoke endpoint", () => {
    it("lets the owner revoke a grant", async () => {
      const agent = await createAliceAgent();
      await share(aliceToken, agent.id, "bob");

      const res = await revoke(aliceToken, agent.id, "bob");
      expect(res.status).toBe(200);

      const stored = await mimoContext.repos.agents.findById(agent.id);
      expect(stored?.sharedWith).toEqual([]);
    });

    it("does not let a non-owner revoke", async () => {
      const agent = await createAliceAgent();
      await share(aliceToken, agent.id, "bob");

      const res = await revoke(bobToken, agent.id, "bob");
      expect(res.status).toBe(404);

      const stored = await mimoContext.repos.agents.findById(agent.id);
      expect(stored?.sharedWith.length).toBe(1);
    });
  });

  describe("List agents (union)", () => {
    it("includes agents shared with the user", async () => {
      const agent = await createAliceAgent("Shared One");
      await share(aliceToken, agent.id, "bob");

      const res = await listAgents(bobToken);
      const json = await res.json();
      expect(res.status).toBe(200);
      const ids = json.data.agents.map((a: any) => a.id);
      expect(ids).toContain(agent.id);
    });

    it("does not include agents not shared with the user", async () => {
      const agent = await createAliceAgent();
      const res = await listAgents(carolToken);
      const json = await res.json();
      const ids = json.data.agents.map((a: any) => a.id);
      expect(ids).not.toContain(agent.id);
    });
  });

  describe("Detail view authorization", () => {
    it("lets a shared user view the agent without the token", async () => {
      const agent = await createAliceAgent();
      await share(aliceToken, agent.id, "bob");

      const res = await getAgent(bobToken, agent.id);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.agent.id).toBe(agent.id);
      expect(json.data.token).toBeUndefined();
    });

    it("gives the owner the token", async () => {
      const agent = await createAliceAgent();
      const res = await getAgent(aliceToken, agent.id);
      const json = await res.json();
      expect(json.data.token).toBeDefined();
    });

    it("hides the agent from unrelated users", async () => {
      const agent = await createAliceAgent();
      const res = await getAgent(carolToken, agent.id);
      expect(res.status).toBe(404);
    });
  });

  describe("Capabilities access (model/mode picker)", () => {
    function getCapabilities(token: string, agentId: string) {
      return app.fetch(
        new Request(
          `http://localhost:3000/api/internal/agents/${agentId}/capabilities`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
    }

    async function withCaps(agentId: string) {
      await mimoContext.repos.agents.updateCapabilities(agentId, {
        availableModels: [{ value: "m1", name: "Model 1" }],
        defaultModelId: "m1",
        availableModes: [{ value: "code", name: "Code" }],
        defaultModeId: "code",
      });
    }

    it("lets a shared user read capabilities so they can pick a model/mode", async () => {
      const agent = await createAliceAgent();
      await withCaps(agent.id);
      await share(aliceToken, agent.id, "bob");

      const res = await getCapabilities(bobToken, agent.id);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.capabilities.availableModels.length).toBe(1);
      expect(json.data.capabilities.availableModes.length).toBe(1);
    });

    it("hides capabilities from unrelated users", async () => {
      const agent = await createAliceAgent();
      await withCaps(agent.id);

      const res = await getCapabilities(carolToken, agent.id);
      expect(res.status).toBe(404);
    });
  });

  describe("Chat-thread agent assignment (gate 2)", () => {
    async function bobSessionId() {
      const project = await mimoContext.repos.projects.create({
        name: "Bob Project",
        repoUrl: "https://example.com/repo.git",
        repoType: "git",
        owner: "bob",
      });
      const session = await mimoContext.repos.sessions.create({
        name: "Bob Session",
        projectId: project.id,
        owner: "bob",
      });
      return session.id;
    }

    function addThread(token: string, sessionId: string, agentId: string) {
      return app.fetch(
        new Request(
          `http://localhost:3000/api/internal/sessions/${sessionId}/chat-threads`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: "Thread",
              model: "model-x",
              mode: "code",
              assignedAgentId: agentId,
            }),
          },
        ),
      );
    }

    it("allows assigning an agent shared with the user", async () => {
      const agent = await createAliceAgent();
      await share(aliceToken, agent.id, "bob");
      const sessionId = await bobSessionId();

      const res = await addThread(bobToken, sessionId, agent.id);
      expect(res.status).toBe(201);
    });

    it("rejects assigning an agent the user neither owns nor is shared", async () => {
      const agent = await createAliceAgent();
      const sessionId = await bobSessionId();

      const res = await addThread(bobToken, sessionId, agent.id);
      expect(res.status).toBe(404);
    });
  });

  describe("User search", () => {
    function search(token: string, query: string, agentId?: string) {
      const url = new URL("http://localhost:3000/api/internal/users/search");
      url.searchParams.set("q", query);
      if (agentId) url.searchParams.set("agentId", agentId);
      return app.fetch(
        new Request(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
    }

    it("requires authentication", async () => {
      const res = await app.fetch(
        new Request("http://localhost:3000/api/internal/users/search?q=bo"),
      );
      expect(res.status).toBe(401);
    });

    it("returns matching usernames excluding the requester", async () => {
      const res = await search(aliceToken, "a");
      const json = await res.json();
      expect(res.status).toBe(200);
      const names = json.data.users.map((u: any) => u.username);
      expect(names).toContain("carol");
      expect(names).not.toContain("alice");
    });

    it("excludes users already shared on the given agent", async () => {
      const agent = await createAliceAgent();
      await share(aliceToken, agent.id, "bob");

      const res = await search(aliceToken, "b", agent.id);
      const json = await res.json();
      const names = json.data.users.map((u: any) => u.username);
      expect(names).not.toContain("bob");
    });
  });
});
