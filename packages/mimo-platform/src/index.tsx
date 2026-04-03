import { Hono } from "hono";
import auth from "./auth/routes";
import protectedRoutes from "./protected/routes";
import projects from "./projects/routes";
import agents from "./agents/routes";
import sessions from "./sessions/routes";
import { agentService } from "./agents/service.js";
import { fileSyncService } from "./sync/service.js";
import { chatService } from "./sessions/chat.js";
import { sessionRepository } from "./sessions/repository.js";
import { LandingPage } from "./components/LandingPage.js";
import { projectRepository } from "./projects/repository.js";

const app = new Hono();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Track active chat sessions
const chatSessions = new Map();

// Auth routes
app.route("/auth", auth);

// Landing page (public)
app.get("/", async (c) => {
  const publicProjects = await projectRepository.listAllPublic();
  const user = c.get("user") as { username: string } | undefined;
  const isAuthenticated = !!user;
  const username = user?.username;
  return c.html(<LandingPage projects={publicProjects} isAuthenticated={isAuthenticated} username={username} />);
});

// Public projects API (no auth required)
app.get("/api/projects/public", async (c) => {
  const publicProjects = await projectRepository.listAllPublic();
  return c.json(publicProjects);
});

// Protected routes
app.route("/", protectedRoutes);

// Project routes (protected)
app.route("/projects", projects);

// Session routes (protected)
app.route("/sessions", sessions);

// Agent routes (protected)
app.route("/agents", agents);

// File sync routes (protected)
import syncRoutes from "./sync/routes";
app.route("/sync", syncRoutes);

// Commit routes (protected)
import commitRoutes from "./commits/routes";
app.route("/commits", commitRoutes);

// Config routes (protected)
import configRoutes from "./config/routes";
app.route("/config", configRoutes);

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
    // WebSocket handler for different connection types
    async message(ws, message) {
      try {
        const data = JSON.parse(message as string);
        const connectionType = ws.data?.connectionType;
        
        switch (connectionType) {
          case 'agent':
            await handleAgentMessage(ws, data);
            break;
          case 'chat':
            await handleChatMessage(ws, data);
            break;
          default:
            console.log("Unknown connection type");
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    },
    async open(ws) {
      const url = new URL(ws.data.url);
      const type = url.pathname.split('/')[2]; // /ws/chat or /ws/agent
      
      if (type === 'chat') {
        // Chat connection
        const sessionId = url.pathname.split('/')[3];
        ws.data.connectionType = 'chat';
        ws.data.sessionId = sessionId;
        
        // Add to session subscribers
        if (!chatSessions.has(sessionId)) {
          chatSessions.set(sessionId, new Set());
        }
        chatSessions.get(sessionId).add(ws);
        
        // Send chat history
        const history = await chatService.loadHistory(sessionId);
        ws.send(JSON.stringify({
          type: 'history',
          messages: history,
        }));
        
        console.log(`Chat client connected to session ${sessionId}`);
      } else {
        // Agent connection
        const token = url.searchParams.get("token");
        
        if (!token) {
          ws.close(1008, "Missing token");
          return;
        }

        const payload = await agentService.verifyAgentToken(token);
        if (!payload) {
          ws.close(1008, "Invalid token");
          return;
        }

        ws.data.connectionType = 'agent';
        ws.data.agentId = payload.agentId;
        
        await agentService.handleAgentConnect(payload.agentId, ws);
        console.log(`Agent ${payload.agentId} connected`);
      }
    },
    async close(ws) {
      const connectionType = ws.data?.connectionType;
      
      if (connectionType === 'chat') {
        // Remove from session subscribers
        const sessionId = ws.data.sessionId;
        if (chatSessions.has(sessionId)) {
          chatSessions.get(sessionId).delete(ws);
          if (chatSessions.get(sessionId).size === 0) {
            chatSessions.delete(sessionId);
          }
        }
        console.log(`Chat client disconnected from session ${sessionId}`);
      } else if (connectionType === 'agent') {
        const agentId = ws.data.agentId;
        if (agentId) {
          await agentService.handleAgentDisconnect(agentId);
          console.log(`Agent ${agentId} disconnected`);
        }
      }
    },
  },
});

// Handle agent messages
async function handleAgentMessage(ws, data) {
  switch (data.type) {
    case "ping":
      ws.send(JSON.stringify({ type: "pong" }));
      break;
    case "agent_ready":
      console.log("Agent ready:", data.agentId);
      break;
    case "acp_response":
      // Handle ACP response and broadcast to chat
      // Agent must specify which session this is for
      const sessionId = data.sessionId;
      if (!sessionId) {
        console.log("No sessionId in acp_response");
        return;
      }
      
      // Broadcast to all chat clients in session
      const subscribers = chatSessions.get(sessionId);
      if (subscribers) {
        subscribers.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({
              type: 'message',
              role: 'assistant',
              content: data.content,
              timestamp: new Date().toISOString(),
            }));
          }
        });
      }
      
      // Save to history
      await chatService.saveMessage(sessionId, {
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toISOString(),
      });
      break;
    case "file_changed":
      console.log("File changed:", data.files);
      
      const fileSessionId = data.sessionId;
      if (!fileSessionId) {
        console.log("No sessionId in file_changed");
        return;
      }
      
      const changes = data.files.map((file) => ({
        path: file.path,
        isNew: file.isNew,
        deleted: file.deleted,
      }));
      
      await fileSyncService.initializeSession(fileSessionId, "", "");
      await fileSyncService.handleFileChanges(fileSessionId, changes);
      break;
    default:
      console.log("Unknown agent message type:", data.type);
  }
}

// Handle chat messages
async function handleChatMessage(ws, data) {
  const sessionId = ws.data.sessionId;
  
  switch (data.type) {
    case "send_message":
      // Save user message
      await chatService.saveMessage(sessionId, {
        role: 'user',
        content: data.content,
        timestamp: new Date().toISOString(),
      });
      
      // Broadcast to all clients in session
      const subscribers = chatSessions.get(sessionId);
      if (subscribers) {
        subscribers.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'message',
              role: 'user',
              content: data.content,
              timestamp: new Date().toISOString(),
            }));
          }
        });
      }
      
      // Get session to find assigned agent
      const session = await sessionRepository.findById(sessionId);
      if (session?.assignedAgentId) {
        // Forward to agent if connected
        const ws = agentService.getAgentConnection(session.assignedAgentId);
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'user_message',
            sessionId: sessionId,
            content: data.content,
          }));
        }
      }
      break;
      
    case "request_replay":
      const history = await chatService.loadHistory(sessionId);
      ws.send(JSON.stringify({
        type: 'history',
        messages: history,
      }));
      break;
      
    default:
      console.log("Unknown chat message type:", data.type);
  }
}

// Server is ready
console.log(`Server running at http://localhost:${server.port}`);
