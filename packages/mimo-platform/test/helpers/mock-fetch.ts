/**
 * Test helper to mock fetch calls for the Internal API Client.
 *
 * Usage:
 * ```typescript
 * import { setupInternalApiMock, teardownInternalApiMock } from "./helpers/mock-fetch.ts";
 *
 * beforeEach(() => {
 *   const repos = { sessions: sessionRepository, agents: agentRepository };
 *   setupInternalApiMock(repos);
 * });
 *
 * afterEach(() => {
 *   teardownInternalApiMock();
 * });
 * ```
 */

let originalFetch: typeof globalThis.fetch;
let mockActive = false;

export interface MockRepos {
  sessions?: {
    findById: (id: string) => Promise<unknown>;
    create?: (data: unknown) => Promise<unknown>;
    addChatThread?: (sessionId: string, thread: unknown) => Promise<unknown>;
    updateChatThread?: (sessionId: string, threadId: string, updates: unknown) => Promise<unknown>;
    deleteChatThread?: (sessionId: string, threadId: string) => Promise<unknown>;
  };
  agents?: {
    findById: (id: string) => Promise<unknown>;
    findByOwner?: (owner: string) => Promise<unknown[]>;
    findByStatus?: (status: string) => Promise<unknown[]>;
    create?: (data: unknown) => Promise<unknown>;
    updateCapabilities?: (id: string, caps?: unknown) => Promise<void>;
  };
  projects?: {
    findById: (id: string) => Promise<unknown>;
    listByOwner?: (owner: string) => Promise<unknown[]>;
    create?: (data: unknown) => Promise<unknown>;
  };
  credentials?: {
    findById: (id: string, owner: string) => Promise<unknown>;
    findByOwner?: (owner: string) => Promise<unknown[]>;
    create?: (data: unknown) => Promise<unknown>;
  };
}

export function setupInternalApiMock(repos: MockRepos) {
  if (mockActive) {
    teardownInternalApiMock();
  }

  originalFetch = globalThis.fetch;
  mockActive = true;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();
    const method = init?.method || "GET";

    // Handle internal API calls
    if (!urlStr.includes("/api/internal/")) {
      // Passthrough for non-internal API calls
      return originalFetch(input, init);
    }

    // Parse the URL to extract path components
    const url = new URL(urlStr);
    const path = url.pathname.replace("/api/internal", "");

    // Sessions endpoints
    const sessionsMatch = path.match(/^\/sessions(?:\/([^\/]+))?(?:\/(.+))?$/);
    if (sessionsMatch) {
      const sessionId = sessionsMatch[1];
      const subPath = sessionsMatch[2];

      // POST /sessions (create)
      if (method === "POST" && !sessionId && repos.sessions?.create) {
        const body = JSON.parse(init?.body as string);
        const session = await repos.sessions.create(body);
        return new Response(
          JSON.stringify({ success: true, data: { session } }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }

      if (sessionId) {
        const session = await repos.sessions?.findById(sessionId);

        if (!session) {
          return new Response(
            JSON.stringify({ success: false, error: "Session not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }

        // POST /sessions/:id/chat-threads
        if (method === "POST" && subPath === "chat-threads" && repos.sessions?.addChatThread) {
          const body = JSON.parse(init?.body as string);
          const thread = await repos.sessions.addChatThread(sessionId, body);
          return new Response(
            JSON.stringify({ success: true, data: { thread } }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }

        // PATCH /sessions/:id/chat-threads/:threadId
        if (method === "PUT" && subPath?.startsWith("chat-threads/") && repos.sessions?.updateChatThread) {
          const threadId = subPath.replace("chat-threads/", "");
          const body = JSON.parse(init?.body as string);
          const thread = await repos.sessions.updateChatThread(sessionId, threadId, body);
          return new Response(
            JSON.stringify({ success: true, data: { thread } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // DELETE /sessions/:id/chat-threads/:threadId
        if (method === "DELETE" && subPath?.startsWith("chat-threads/") && repos.sessions?.deleteChatThread) {
          const threadId = subPath.replace("chat-threads/", "");
          await repos.sessions.deleteChatThread(sessionId, threadId);
          return new Response(
            JSON.stringify({ success: true, data: {} }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // GET /sessions/:id
        if (!subPath) {
          return new Response(
            JSON.stringify({ success: true, data: { session } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // GET /sessions/:id/details
        if (subPath === "details") {
          return new Response(
            JSON.stringify({ success: true, data: { session } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // DELETE /sessions/:id
        if (method === "DELETE" && !subPath) {
          return new Response(
            JSON.stringify({ success: true, data: {} }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      // GET /sessions
      if (!sessionId && repos.sessions?.findById) {
        // List sessions - for now just return empty
        return new Response(
          JSON.stringify({ success: true, data: { sessions: [] } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Agents endpoints
    const agentsMatch = path.match(/^\/agents(?:\/([^\/]+))?(?:\/(.+))?$/);
    if (agentsMatch) {
      const agentId = agentsMatch[1];
      const subPath = agentsMatch[2];

      if (agentId) {
        // POST /agents/:id/capabilities/refresh
        if (method === "POST" && subPath === "capabilities/refresh" && repos.agents?.updateCapabilities) {
          const agent = await repos.agents.findById(agentId);
          if (!agent) {
            return new Response(
              JSON.stringify({ success: false, error: "Agent not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          await repos.agents.updateCapabilities(agentId, undefined);
          return new Response(
            JSON.stringify({ success: true, data: { requested: true } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // GET /agents/:id
        if (!subPath) {
          const agent = await repos.agents?.findById(agentId);
          if (!agent) {
            return new Response(
              JSON.stringify({ success: false, error: "Agent not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ success: true, data: { agent } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      // GET /agents
      if (!agentId && repos.agents?.findByOwner) {
        // Get owner from query or token
        const agents = await repos.agents.findByOwner("testuser");
        return new Response(
          JSON.stringify({ success: true, data: { agents } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Projects endpoints
    const projectsMatch = path.match(/^\/projects(?:\/([^\/]+))?$/);
    if (projectsMatch) {
      const projectId = projectsMatch[1];

      if (projectId) {
        const project = await repos.projects?.findById(projectId);
        if (!project) {
          return new Response(
            JSON.stringify({ success: false, error: "Project not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ success: true, data: { project } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // GET /projects
      if (repos.projects?.listByOwner) {
        const projects = await repos.projects.listByOwner("testuser");
        return new Response(
          JSON.stringify({ success: true, data: { projects } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Credentials endpoints
    const credentialsMatch = path.match(/^\/credentials(?:\/([^\/]+))?$/);
    if (credentialsMatch) {
      const credentialId = credentialsMatch[1];

      if (credentialId) {
        // DELETE /credentials/:id
        if (method === "DELETE") {
          return new Response(
            JSON.stringify({ success: true, data: { deleted: true } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        const credential = await repos.credentials?.findById(credentialId, "testuser");
        if (!credential) {
          return new Response(
            JSON.stringify({ success: false, error: "Credential not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ success: true, data: { credential } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // GET /credentials
      if (repos.credentials?.findByOwner) {
        const credentials = await repos.credentials.findByOwner("testuser");
        return new Response(
          JSON.stringify({ success: true, data: { credentials } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Dashboard endpoint
    if (path === "/dashboard") {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            projects: [],
            agents: [],
            recentSessions: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Config endpoint
    if (path === "/config") {
      if (method === "GET") {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              config: {
                theme: "dark",
                fontSize: 14,
                fontFamily: "monospace",
                sessionKeybindings: {},
                globalKeybindings: {},
                chatFileExtensions: [],
                streamingTimeoutMs: 30000,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (method === "PUT") {
        const body = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            success: true,
            data: { config: body },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // MCP Servers endpoints
    const mcpServersMatch = path.match(/^\/mcp-servers(?:\/([^\/]+))?(?:\/(.+))?$/);
    if (mcpServersMatch) {
      const serverId = mcpServersMatch[1];
      const subPath = mcpServersMatch[2];

      // GET /mcp-servers
      if (method === "GET" && !serverId) {
        return new Response(
          JSON.stringify({ success: true, data: { servers: [] } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // GET /mcp-servers/:id
      if (method === "GET" && serverId && !subPath) {
        return new Response(
          JSON.stringify({ success: false, error: "MCP server not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Chat endpoints
    if (path === "/chat/messages") {
      if (method === "POST") {
        return new Response(
          JSON.stringify({ success: true, data: { saved: true } }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Summary endpoint
    if (path.match(/^\/sessions\/[^\/]+\/summary$/)) {
      return new Response(
        JSON.stringify({ success: true, data: { summary: "Test summary" } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Session touch endpoint
    const touchMatch = path.match(/^\/sessions\/([^\/]+)\/touch$/);
    if (touchMatch && method === "POST") {
      return new Response(
        JSON.stringify({ success: true, data: {} }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Session config endpoint
    const configMatch = path.match(/^\/sessions\/([^\/]+)\/config$/);
    if (configMatch && method === "PUT") {
      const sessionId = configMatch[1];
      const body = JSON.parse(init?.body as string);
      const session = await repos.sessions?.findById(sessionId);
      if (session) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            data: { 
              session: { 
                ...session, 
                ...body,
                id: sessionId 
              } 
            } 
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Default: not found
    console.warn(`Unhandled internal API call: ${method} ${path}`);
    return new Response(
      JSON.stringify({ success: false, error: "Not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  };
}

export function teardownInternalApiMock() {
  if (mockActive && originalFetch) {
    globalThis.fetch = originalFetch;
    mockActive = false;
  }
}
