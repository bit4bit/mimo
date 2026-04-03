import { Hono } from "hono";
import auth from "./auth/routes";
import protectedRoutes from "./protected/routes";
import projects from "./projects/routes";
import agents from "./agents/routes";
import sessions from "./sessions/routes";
import { agentService } from "./agents/service.js";

const app = new Hono();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Auth routes
app.route("/auth", auth);

// Protected routes
app.route("/", protectedRoutes);

// Project routes (protected)
app.route("/projects", projects);

// Session routes (protected)
app.route("/sessions", sessions);

// Agent routes (protected)
app.route("/agents", agents);

// Health check
app.get("/health", (c) => {
  console.log("Health check hit");
  return c.json({ status: "healthy" });
});

// 404 handler
app.notFound((c) => {
  console.log(`404: ${c.req.url}`);
  return c.json({ error: "Not Found", path: c.req.path }, 404);
});

const server = Bun.serve({
  fetch: app.fetch,
  port: PORT,
  websocket: {
    // WebSocket handler for agent connections
    async message(ws, message) {
      try {
        const data = JSON.parse(message as string);
        
        // Handle different message types from agent
        switch (data.type) {
          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;
          case "agent_ready":
            // Agent is ready to receive requests
            console.log("Agent ready:", data.agentId);
            break;
          case "acp_response":
            // ACP response from agent
            // Forward to chat via session WebSocket
            break;
          case "file_changed":
            // File change notification from agent
            console.log("File changed:", data.path);
            break;
          default:
            console.log("Unknown message type:", data.type);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    },
    async open(ws) {
      const url = new URL(ws.data.url);
      const token = url.searchParams.get("token");
      
      if (!token) {
        ws.close(1008, "Missing token");
        return;
      }

      // Verify agent token
      const payload = await agentService.verifyAgentToken(token);
      if (!payload) {
        ws.close(1008, "Invalid token");
        return;
      }

      // Store agent ID in WebSocket data
      ws.data.agentId = payload.agentId;
      
      // Handle agent connection
      await agentService.handleAgentConnect(payload.agentId, ws);
      
      console.log(`Agent ${payload.agentId} connected`);
    },
    async close(ws) {
      const agentId = ws.data.agentId;
      if (agentId) {
        await agentService.handleAgentDisconnect(agentId);
        console.log(`Agent ${agentId} disconnected`);
      }
    },
  },
});

// Run cleanup periodically
setInterval(() => {
  agentService.cleanupDeadAgents();
}, 30000); // Every 30 seconds

console.log(`Server running at http://localhost:${server.port}`);
