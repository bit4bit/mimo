/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { McpServerListPage } from "../components/McpServerListPage.js";
import { McpServerFormPage } from "../components/McpServerFormPage.js";
import type { Context } from "hono";
import type { MimoContext } from "../../../../infrastructure/context/mimo-context.js";
import type { McpServerResponse } from "../../../../api/rest/mcp-servers/types.js";
import { createInternalApiClient } from "../../../../api/rest/index.js";

// Helper to get authenticated username - uses mimoContext
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

export function createMcpServerRoutes(
  mimoContext: MimoContext,
  deps: { fetchFn?: typeof fetch } = {},
): Hono {
  const router = new Hono();

  // GET /mcp-servers - List all MCP servers (HTML or JSON based on Accept header)
  router.get("/", async (c: Context) => {
    const username = await getAuthUsername(c, mimoContext);
    if (!username) {
      return c.redirect("/auth/login");
    }

    // Use internal API client
    const apiClient = createInternalApiClient(c, mimoContext, {
      fetchFn: deps.fetchFn,
    });
    const result = await apiClient.get<{ servers: McpServerResponse[] }>(
      "/mcp-servers",
    );

    if (!result.success) {
      if (c.req.header("Accept")?.includes("application/json")) {
        return c.json({ error: result.error }, result.status as any);
      }
      return c.html(
        <McpServerListPage
          servers={[]}
          error={result.error || "Failed to fetch MCP servers"}
        />,
      );
    }

    const servers = result.data.servers || [];

    // Check if client wants JSON
    const acceptHeader = c.req.header("Accept");
    if (acceptHeader?.includes("application/json")) {
      return c.json(servers);
    }

    // Otherwise render HTML page
    return c.html(<McpServerListPage servers={servers} />);
  });

  // GET /mcp-servers/new - Show create form
  router.get("/new", async (c: Context) => {
    const username = await getAuthUsername(c, mimoContext);
    if (!username) {
      return c.redirect("/auth/login");
    }

    return c.html(<McpServerFormPage />);
  });

  // GET /mcp-servers/:id/edit - Show edit form
  router.get("/:id/edit", async (c: Context) => {
    const username = await getAuthUsername(c, mimoContext);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const id = c.req.param("id");
    const apiClient = createInternalApiClient(c, mimoContext, {
      fetchFn: deps.fetchFn,
    });
    const result = await apiClient.get<{ server: McpServerResponse }>(
      `/mcp-servers/${id}`,
    );

    if (!result.success) {
      if (result.status === 404) {
        return c.html(
          <McpServerFormPage error="MCP server not found" isEditing={true} />,
        );
      }
      return c.html(
        <McpServerFormPage
          error={result.error || "Failed to fetch MCP server"}
          isEditing={true}
        />,
      );
    }

    return c.html(
      <McpServerFormPage server={result.data.server} isEditing={true} />,
    );
  });

  // POST /mcp-servers - Create new MCP server (from form)
  router.post("/", async (c: Context) => {
    const username = await getAuthUsername(c, mimoContext);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const contentType = c.req.header("Content-Type");
      const apiClient = createInternalApiClient(c, mimoContext, {
        fetchFn: deps.fetchFn,
      });

      if (contentType?.includes("application/json")) {
        // JSON API request
        const body = await c.req.json();
        const result = await apiClient.post<{ server: McpServerResponse }>(
          "/mcp-servers",
          body,
        );

        if (!result.success) {
          return c.json({ error: result.error }, result.status as any);
        }

        return c.json(result.data.server, 201);
      } else {
        // Form submission
        const body = await c.req.parseBody();
        const name = body.name as string;
        const description = body.description as string;
        const transport = (body.transport as string) || "stdio";

        let apiBody: Record<string, unknown>;

        if (transport === "stdio") {
          const command = body.command as string;
          const argsText = body.args as string;
          const args = argsText
            ? argsText.split("\n").filter((line) => line.trim())
            : [];

          apiBody = {
            name,
            description,
            transport,
            command,
            args,
          };
        } else {
          // HTTP or SSE transport
          const url = body.url as string;
          const headersText = body.headers as string;
          let headers: Record<string, string> | undefined;
          if (headersText) {
            headers = {};
            headersText.split("\n").forEach((line) => {
              const [key, value] = line.split(":").map((s) => s.trim());
              if (key && value) headers![key] = value;
            });
          }

          apiBody = {
            name,
            description,
            transport: transport as "http" | "sse",
            url,
            headers,
          };
        }

        const result = await apiClient.post<{ server: McpServerResponse }>(
          "/mcp-servers",
          apiBody,
        );

        if (!result.success) {
          return c.html(
            <McpServerFormPage
              error={result.error || "Failed to create MCP server"}
            />,
          );
        }

        return c.redirect("/mcp-servers");
      }
    } catch (error: any) {
      if (c.req.header("Content-Type")?.includes("application/json")) {
        return c.json({ error: error.message }, 400);
      } else {
        return c.html(<McpServerFormPage error={error.message} />);
      }
    }
  });

  // POST /mcp-servers/:id/delete - Delete MCP server (from form)
  router.post("/:id/delete", async (c: Context) => {
    const username = await getAuthUsername(c, mimoContext);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const id = c.req.param("id");
    const apiClient = createInternalApiClient(c, mimoContext, {
      fetchFn: deps.fetchFn,
    });
    await apiClient.delete<void>(`/mcp-servers/${id}`);

    return c.redirect("/mcp-servers");
  });

  // GET /mcp-servers/:id - Get one MCP server
  router.get("/:id", async (c: Context) => {
    const username = await getAuthUsername(c, mimoContext);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const id = c.req.param("id");
    const apiClient = createInternalApiClient(c, mimoContext, {
      fetchFn: deps.fetchFn,
    });
    const result = await apiClient.get<{ server: McpServerResponse }>(
      `/mcp-servers/${id}`,
    );

    if (!result.success) {
      if (result.status === 404) {
        return c.json({ error: "MCP server not found" }, 404);
      }
      return c.json({ error: result.error }, result.status as any);
    }

    return c.json(result.data.server);
  });

  // PATCH /mcp-servers/:id - Update MCP server (JSON API)
  router.patch("/:id", async (c: Context) => {
    const username = await getAuthUsername(c, mimoContext);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    const body = await c.req.json();

    const apiClient = createInternalApiClient(c, mimoContext, {
      fetchFn: deps.fetchFn,
    });
    const result = await apiClient.put<{ server: McpServerResponse }>(
      `/mcp-servers/${id}`,
      body,
    );

    if (!result.success) {
      return c.json({ error: result.error }, result.status as any);
    }

    return c.json(result.data.server);
  });

  // POST /mcp-servers/:id - Update MCP server (form submission with _method=PATCH)
  router.post("/:id", async (c: Context) => {
    const username = await getAuthUsername(c, mimoContext);
    if (!username) {
      return c.redirect("/auth/login");
    }

    const id = c.req.param("id");
    const body = await c.req.parseBody();

    // Check if this is a PATCH override
    const method = body._method as string;
    if (method === "PATCH") {
      const name = body.name as string;
      const description = body.description as string;
      const transport = (body.transport as string) || "stdio";

      let apiBody: Record<string, unknown>;

      if (transport === "stdio") {
        const command = body.command as string;
        const argsText = body.args as string;
        const args = argsText
          ? argsText.split("\n").filter((line) => line.trim())
          : [];

        apiBody = {
          name,
          description,
          transport,
          command,
          args,
        };
      } else {
        // HTTP or SSE transport
        const url = body.url as string;
        const headersText = body.headers as string;
        let headers: Record<string, string> | undefined;
        if (headersText) {
          headers = {};
          headersText.split("\n").forEach((line) => {
            const [key, value] = line.split(":").map((s) => s.trim());
            if (key && value) headers![key] = value;
          });
        }

        apiBody = {
          name,
          description,
          transport: transport as "http" | "sse",
          url,
          headers,
        };
      }

      const apiClient = createInternalApiClient(c, mimoContext, {
        fetchFn: deps.fetchFn,
      });
      const result = await apiClient.put<{ server: McpServerResponse }>(
        `/mcp-servers/${id}`,
        apiBody,
      );

      if (!result.success) {
        const serverResult = await apiClient.get<{ server: McpServerResponse }>(
          `/mcp-servers/${id}`,
        );
        return c.html(
          <McpServerFormPage
            server={serverResult.success ? serverResult.data.server : undefined}
            error={result.error || "Failed to update MCP server"}
            isEditing={true}
          />,
        );
      }

      return c.redirect("/mcp-servers");
    }

    // Regular POST (shouldn't happen, but redirect to list)
    return c.redirect("/mcp-servers");
  });

  // DELETE /mcp-servers/:id - Delete MCP server (JSON API)
  router.delete("/:id", async (c: Context) => {
    const username = await getAuthUsername(c, mimoContext);
    if (!username) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    const apiClient = createInternalApiClient(c, mimoContext, {
      fetchFn: deps.fetchFn,
    });
    const result = await apiClient.delete<void>(`/mcp-servers/${id}`);

    if (!result.success) {
      return c.json({ error: result.error }, result.status as any);
    }

    return c.json({ success: true });
  });

  return router;
}
