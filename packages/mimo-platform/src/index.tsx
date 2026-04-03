import { Hono } from "hono";
import auth from "./auth/routes";
import protectedRoutes from "./protected/routes";
import projects from "./projects/routes";
import agents from "./agents/routes";
import sessions from "./sessions/routes";
import dashboard from "./dashboard/routes";
import { agentService } from "./agents/service.js";
import { agentRepository } from "./agents/repository.js";
import { fileSyncService } from "./sync/service.js";
import { chatService } from "./sessions/chat.js";
import { sessionRepository } from "./sessions/repository.js";
import { LandingPage } from "./components/LandingPage.js";
import { projectRepository } from "./projects/repository.js";
import { fossilServerManager } from "./vcs/fossil-server.js";
import { relative } from "path";

const app = new Hono();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Track active chat sessions
const chatSessions = new Map();

// Auth routes
app.route("/auth", auth);

// Dashboard (protected)
app.route("/dashboard", dashboard);

// Landing page (public)
app.get("/", async (c) => {
  const publicProjects = await projectRepository.listAllPublic();
  const user = c.get("user") as { username: string } | undefined;
  const isAuthenticated = !!user;
  const username = user?.username;
  
  // If authenticated, redirect to dashboard
  if (isAuthenticated) {
    return c.redirect("/dashboard");
  }
  
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
  async fetch(req: Request, server: any) {
    const url = new URL(req.url);
    
    // Handle WebSocket upgrade requests
    if (req.headers.get("upgrade") === "websocket") {
      const type = url.pathname.split('/')[2]; // /ws/agent or /ws/chat
      
      if (type === 'agent') {
        const token = url.searchParams.get("token");
        if (!token) {
          return new Response("Missing token", { status: 400 });
        }
        
        const payload = await agentService.verifyAgentToken(token);
        if (!payload) {
          return new Response("Invalid token", { status: 401 });
        }
        
        const upgraded = server.upgrade(req, {
          data: {
            connectionType: 'agent',
            agentId: payload.agentId,
            url: req.url
          }
        });
        
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return undefined;
      }
      
      if (type === 'chat') {
        const sessionId = url.pathname.split('/')[3];
        if (!sessionId) {
          return new Response("Missing sessionId", { status: 400 });
        }
        
        const upgraded = server.upgrade(req, {
          data: {
            connectionType: 'chat',
            sessionId,
            url: req.url
          }
        });
        
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return undefined;
      }
      
      return new Response("Unknown WebSocket endpoint", { status: 404 });
    }
    
    return app.fetch(req);
  },
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
        ws.data.authenticated = true;  // Mark as authenticated, waiting for agent_ready
        
        await agentService.handleAgentConnect(payload.agentId, ws);
        console.log(`Agent ${payload.agentId} connected, waiting for agent_ready`);
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

          // Stop Fossil servers for assigned sessions after grace period
          const agent = await agentRepository.findById(agentId);
          if (agent && agent.sessionIds && agent.sessionIds.length > 0) {
            // 30-second grace period for unexpected disconnects
            setTimeout(async () => {
              // Check if agent reconnected
              if (!agentService.isAgentOnline(agentId)) {
                // Agent didn't reconnect, stop all servers
                for (const sessionId of agent.sessionIds) {
                  if (fossilServerManager.isServerRunning(sessionId)) {
                    await fossilServerManager.stopServer(sessionId);
                    console.log(`Stopped Fossil server for session ${sessionId}`);
                  }
                }
              }
            }, 30000);
          }
        }
      }
    },
  },
});

// Handle agent messages
async function handleAgentMessage(ws, data) {
  console.log("[agent] Received message:", data.type, data);
  process.stdout?.write?.(""); // Flush stdout
  
  switch (data.type) {
    case "ping":
      ws.send(JSON.stringify({ type: "pong" }));
      break;
    case "agent_ready":
      console.log("[agent] Agent ready:", data.agentId, "workdir:", data.workdir);
      process.stdout?.write?.(""); // Flush stdout
      
      // Store workdir for relative path computation
      const agentId = ws.data.agentId;
      if (data.workdir) {
        agentService.handleAgentConnect(agentId, ws, data.workdir);
      }
      
      // Start Fossil servers for sessions assigned to this agent
      // Note: Sessions are assigned via assignedAgentId, not in agent.sessionIds
      const sessions = await sessionRepository.findByAssignedAgentId(agentId);
      console.log("[agent] Found", sessions.length, "sessions assigned to agent", agentId);
      process.stdout?.write?.(""); // Flush stdout
      
      if (sessions.length > 0) {
        const sessionsReady = [];
        const workdir = agentService.getAgentWorkdir(agentId);
        console.log("[agent] Workdir:", workdir);
        process.stdout?.write?.(""); // Flush stdout
        
        for (const session of sessions) {
          const sessionId = session.id;
          console.log("[agent] Session:", sessionId, "status:", session.status);
          process.stdout?.write?.(""); // Flush stdout
          
          if (session.status === "active") {
            const fossilPath = `${session.upstreamPath}/../repo.fossil`;
            console.log("[agent] Starting fossil server for session:", sessionId, "fossil:", fossilPath);
            process.stdout?.write?.(""); // Flush stdout
            
            const result = await fossilServerManager.startServer(sessionId, fossilPath);
            console.log("[agent] Fossil server result:", result);
            process.stdout?.write?.(""); // Flush stdout
            
            if ('port' in result) {
              // Update session with port
              await sessionRepository.update(sessionId, { port: result.port });
              
              sessionsReady.push({
                sessionId,
                port: result.port,
              });
            } else {
              console.error("[agent] Failed to start fossil server:", result.error);
            }
          }
        }
        
        // Send session_ready message to agent
        if (sessionsReady.length > 0) {
          const message = {
            type: 'session_ready',
            platformUrl: `http://localhost:${PORT}`,
            sessions: sessionsReady,
          };
          console.log("[agent] Sending session_ready:", JSON.stringify(message));
          process.stdout?.write?.(""); // Flush stdout
          ws.send(JSON.stringify(message));
        } else {
          console.log("[agent] No sessions ready to send");
        }
      } else {
        console.log("[agent] No sessions assigned to agent");
      }
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
    case "session_error":
      console.log("[agent] Session error:", data.sessionId, data.error);
      break;
    case "agent_sessions_ready":
      console.log("[agent] Agent sessions ready:", data.sessionIds);
      break;
    default:
      console.log("[agent] Unknown message type:", data.type);
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
