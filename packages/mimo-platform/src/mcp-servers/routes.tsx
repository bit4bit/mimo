/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { mcpServerService } from "./service.js";
import { verifyToken } from "../auth/jwt.js";
import { McpServerListPage } from "../components/McpServerListPage.js";
import { McpServerFormPage } from "../components/McpServerFormPage.js";
import type { Context } from "hono";

const router = new Hono();

// Helper to get authenticated username
async function getAuthUsername(c: Context): Promise<string | null> {
  const cookieHeader = c.req.header("Cookie");
  const usernameMatch = cookieHeader?.match(/username=([^;]+)/);
  const username = usernameMatch ? usernameMatch[1] : null;
  if (username) return username;
  
  const tokenMatch = cookieHeader?.match(/token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;
  
  if (token) {
    const payload = await verifyToken(token);
    if (payload) return payload.username;
  }
  
  return null;
}

// GET /mcp-servers - List all MCP servers (HTML or JSON based on Accept header)
router.get("/", async (c: Context) => {
  const username = await getAuthUsername(c);
  if (!username) {
    return c.redirect("/auth/login");
  }

  const servers = await mcpServerService.findAll();
  
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
  const username = await getAuthUsername(c);
  if (!username) {
    return c.redirect("/auth/login");
  }

  return c.html(<McpServerFormPage />);
});

// GET /mcp-servers/:id/edit - Show edit form
router.get("/:id/edit", async (c: Context) => {
  const username = await getAuthUsername(c);
  if (!username) {
    return c.redirect("/auth/login");
  }

  const id = c.req.param("id");
  const server = await mcpServerService.findById(id);

  if (!server) {
    return c.html(<McpServerFormPage error="MCP server not found" isEditing={true} />);
  }

  return c.html(<McpServerFormPage server={server} isEditing={true} />);
});

// POST /mcp-servers - Create new MCP server (from form)
router.post("/", async (c: Context) => {
  const username = await getAuthUsername(c);
  if (!username) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const contentType = c.req.header("Content-Type");
    
    if (contentType?.includes("application/json")) {
      // JSON API request
      const body = await c.req.json();
      const { name, description, command, args } = body;

      const server = await mcpServerService.create({
        name,
        description,
        command,
        args: args || [],
      });

      return c.json(server, 201);
    } else {
      // Form submission
      const body = await c.req.parseBody();
      const name = body.name as string;
      const description = body.description as string;
      const command = body.command as string;
      const argsText = body.args as string;
      const args = argsText ? argsText.split('\n').filter(line => line.trim()) : [];

      const server = await mcpServerService.create({
        name,
        description,
        command,
        args,
      });

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
  const username = await getAuthUsername(c);
  if (!username) {
    return c.redirect("/auth/login");
  }

  const id = c.req.param("id");
  await mcpServerService.delete(id);

  return c.redirect("/mcp-servers");
});

// GET /mcp-servers/:id - Get one MCP server
router.get("/:id", async (c: Context) => {
  const username = await getAuthUsername(c);
  if (!username) {
    return c.redirect("/auth/login");
  }

  const id = c.req.param("id");
  const server = await mcpServerService.findById(id);

  if (!server) {
    return c.json({ error: "MCP server not found" }, 404);
  }

  return c.json(server);
});

// PATCH /mcp-servers/:id - Update MCP server (JSON API)
router.patch("/:id", async (c: Context) => {
  const username = await getAuthUsername(c);
  if (!username) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");

  try {
    const body = await c.req.json();
    const { name, description, command, args } = body;

    const server = await mcpServerService.update(id, {
      name,
      description,
      command,
      args,
    });

    if (!server) {
      return c.json({ error: "MCP server not found" }, 404);
    }

    return c.json(server);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// POST /mcp-servers/:id - Update MCP server (form submission with _method=PATCH)
router.post("/:id", async (c: Context) => {
  const username = await getAuthUsername(c);
  if (!username) {
    return c.redirect("/auth/login");
  }

  const id = c.req.param("id");
  const body = await c.req.parseBody();
  
  // Check if this is a PATCH override
  const method = body._method as string;
  if (method === "PATCH") {
    try {
      const name = body.name as string;
      const description = body.description as string;
      const command = body.command as string;
      const argsText = body.args as string;
      const args = argsText ? argsText.split('\n').filter(line => line.trim()) : [];

      const server = await mcpServerService.update(id, {
        name,
        description,
        command,
        args,
      });

      if (!server) {
        return c.html(<McpServerFormPage error="MCP server not found" isEditing={true} />);
      }

      return c.redirect("/mcp-servers");
    } catch (error: any) {
      const server = await mcpServerService.findById(id);
      return c.html(<McpServerFormPage server={server || undefined} error={error.message} isEditing={true} />);
    }
  }

  // Regular POST (shouldn't happen, but redirect to list)
  return c.redirect("/mcp-servers");
});

// DELETE /mcp-servers/:id - Delete MCP server (JSON API)
router.delete("/:id", async (c: Context) => {
  const username = await getAuthUsername(c);
  if (!username) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const result = await mcpServerService.delete(id);

  if (!result) {
    return c.json({ error: "MCP server not found" }, 404);
  }

  return c.json({ success: true });
});

export default router;
