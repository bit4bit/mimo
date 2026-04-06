import { Hono } from "hono";
import { serveStatic } from "hono/bun";
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

// Serve static files from public/
app.use("/js/*", serveStatic({ root: "./public" }));

import { sessionStateService } from "./sessions/state.js";

// Track active chat sessions
const chatSessions = new Map();

// Track streaming message and thought buffers per session
const streamingBuffers = new Map<string, string>();
const thoughtBuffers = new Map<string, string>();

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

// Credentials routes (protected)
import credentialsRoutes from "./credentials/routes";
app.route("/credentials", credentialsRoutes);

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
          console.log("[WS] Missing token");
          return new Response("Missing token", { status: 400 });
        }
        
        const payload = await agentService.verifyAgentToken(token);
        if (!payload) {
          console.log("[WS] Invalid token");
          return new Response("Invalid token", { status: 401 });
        }
        
        console.log("[WS] Token verified, agentId:", payload.agentId);
        
        const upgraded = server.upgrade(req, {
          data: {
            connectionType: 'agent',
            agentId: payload.agentId,
            url: req.url
          }
        });
        
        if (!upgraded) {
          console.log("[WS] WebSocket upgrade failed");
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        console.log("[WS] WebSocket upgraded successfully for agent:", payload.agentId);
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
              
              // Get session with credentials
              const sessionWithCreds = await sessionRepository.findById(sessionId);
              
              sessionsReady.push({
                sessionId,
                name: session.name,
                upstreamPath: session.upstreamPath,
                agentWorkspacePath: session.agentWorkspacePath,
                port: result.port,
                agentWorkspaceUser: sessionWithCreds?.agentWorkspaceUser,
                agentWorkspacePassword: sessionWithCreds?.agentWorkspacePassword,
                acpSessionId: sessionWithCreds?.acpSessionId ?? null,
                localDevMirrorPath: sessionWithCreds?.localDevMirrorPath ?? null,
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
    case "thought_start":
      {
        const startSessionId = data.sessionId;
        if (!startSessionId) {
          console.log("No sessionId in thought_start");
          return;
        }
        
        // Start new thought buffer
        thoughtBuffers.set(startSessionId, "");
        
        // Forward to clients
        const subscribers = chatSessions.get(startSessionId);
        if (subscribers) {
          subscribers.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: data.type,
                timestamp: new Date().toISOString(),
              }));
            }
          });
        }
      }
      break;
      
    case "thought_chunk":
      {
        const chunkSessionId = data.sessionId;
        if (!chunkSessionId) {
          console.log("No sessionId in thought_chunk");
          return;
        }
        
        // Accumulate thought chunks
        const currentThoughtBuffer = thoughtBuffers.get(chunkSessionId) || "";
        thoughtBuffers.set(chunkSessionId, currentThoughtBuffer + (data.content || ""));
        
        // Forward to clients
        const thoughtChunkSubscribers = chatSessions.get(chunkSessionId);
        if (thoughtChunkSubscribers) {
          thoughtChunkSubscribers.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: data.type,
                content: data.content,
                timestamp: new Date().toISOString(),
              }));
            }
          });
        }
      }
      break;
      
    case "thought_end":
      {
        const endSessionId = data.sessionId;
        if (!endSessionId) {
          console.log("No sessionId in thought_end");
          return;
        }
        
        // Forward to clients
        const endSubscribers = chatSessions.get(endSessionId);
        if (endSubscribers) {
          endSubscribers.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: data.type,
                timestamp: new Date().toISOString(),
              }));
            }
          });
        }
      }
      break;
      
    case "message_chunk":
      {
        const msgSessionId = data.sessionId;
        if (!msgSessionId) {
          console.log("No sessionId in message_chunk");
          return;
        }
        
        // Accumulate message chunks
        const currentBuffer = streamingBuffers.get(msgSessionId) || "";
        streamingBuffers.set(msgSessionId, currentBuffer + (data.content || ""));
        
        // Forward to clients
        const msgSubscribers = chatSessions.get(msgSessionId);
        if (msgSubscribers) {
          msgSubscribers.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: data.type,
                content: data.content,
                timestamp: new Date().toISOString(),
              }));
            }
          });
        }
      }
      break;
      
    case "usage_update":
      {
        const usageSessionId = data.sessionId;
        if (!usageSessionId) {
          console.log("No sessionId in usage_update");
          return;
        }
        
        // Get accumulated message and thoughts
        const messageContent = streamingBuffers.get(usageSessionId);
        const thoughtContent = thoughtBuffers.get(usageSessionId);
        
        if (messageContent || thoughtContent) {
          // Save assistant response with optional thoughts
          let fullContent = messageContent || "";
          
          // Prepend thoughts if present
          if (thoughtContent) {
            fullContent = `<details><summary>Thought Process</summary>${thoughtContent}</details>\n\n${fullContent}`;
            thoughtBuffers.delete(usageSessionId);
          }
          
          await chatService.saveMessage(usageSessionId, {
            role: "assistant",
            content: fullContent,
            timestamp: new Date().toISOString(),
          });
          
          // Clear buffer
          streamingBuffers.delete(usageSessionId);
        }
        
        // Forward usage update to clients
        const usageSubscribers = chatSessions.get(usageSessionId);
        if (usageSubscribers) {
          usageSubscribers.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: data.type,
                usage: data.usage,
                timestamp: new Date().toISOString(),
              }));
            }
          });
        }
      }
      break;
    
    case "acp_response":
      // Legacy: Handle simple ACP response and broadcast to chat
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
    case "acp_session_created":
      {
        const { sessionId, acpSessionId, wasReset, resetReason } = data;
        console.log("[agent] ACP session created:", { sessionId, acpSessionId, wasReset, resetReason });
        
        if (sessionId && acpSessionId) {
          await sessionRepository.update(sessionId, { acpSessionId });
          
          if (wasReset) {
            const timestamp = new Date().toISOString();
            const reasonText = resetReason ? ` (${resetReason})` : "";
            const systemMessage = `Session reset at ${timestamp}${reasonText}`;
            await chatService.saveMessage(sessionId, {
              role: "system",
              content: systemMessage,
              timestamp,
            });
          }
        }
      }
      break;
    case "session_initialized":
      // Store model/mode state from agent
      if (data.sessionId) {
        if (data.modelState) {
          sessionStateService.setModelState(data.sessionId, data.modelState);
          console.log(`[agent] Session ${data.sessionId} model state:`, data.modelState.currentModelId);
        }
        if (data.modeState) {
          sessionStateService.setModeState(data.sessionId, data.modeState);
          console.log(`[agent] Session ${data.sessionId} mode state:`, data.modeState.currentModeId);
        }
        
        // Broadcast to chat clients
        const initSubscribers = chatSessions.get(data.sessionId);
        if (initSubscribers) {
          const initMessage: any = {
            type: 'session_initialized',
            sessionId: data.sessionId,
            timestamp: new Date().toISOString(),
          };
          if (data.modelState) {
            initMessage.modelState = data.modelState;
          }
          if (data.modeState) {
            initMessage.modeState = data.modeState;
          }
          
          initSubscribers.forEach((client: WebSocket) => {
            if (client.readyState === 1) {
              client.send(JSON.stringify(initMessage));
            }
          });
        }
      }
      break;
    case "model_state":
      // Update and broadcast model state
      if (data.sessionId && data.modelState) {
        sessionStateService.setModelState(data.sessionId, data.modelState);
        
        const modelSubscribers = chatSessions.get(data.sessionId);
        if (modelSubscribers) {
          modelSubscribers.forEach((client: WebSocket) => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: 'model_state',
                sessionId: data.sessionId,
                modelState: data.modelState,
                timestamp: new Date().toISOString(),
              }));
            }
          });
        }
      }
      break;
    case "mode_state":
      // Update and broadcast mode state
      if (data.sessionId && data.modeState) {
        sessionStateService.setModeState(data.sessionId, data.modeState);
        
        const modeSubscribers = chatSessions.get(data.sessionId);
        if (modeSubscribers) {
          modeSubscribers.forEach((client: WebSocket) => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: 'mode_state',
                sessionId: data.sessionId,
                modeState: data.modeState,
                timestamp: new Date().toISOString(),
              }));
            }
          });
        }
      }
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

    case "set_model":
      // Forward model change to agent
      const modelSession = await sessionRepository.findById(sessionId);
      if (modelSession?.assignedAgentId) {
        const agentWs = agentService.getAgentConnection(modelSession.assignedAgentId);
        if (agentWs && agentWs.readyState === 1) {
          agentWs.send(JSON.stringify({
            type: 'set_model',
            sessionId: sessionId,
            modelId: data.modelId,
          }));
        }
      }
      break;

    case "set_mode":
      // Forward mode change to agent
      const modeSession = await sessionRepository.findById(sessionId);
      if (modeSession?.assignedAgentId) {
        const modeAgentWs = agentService.getAgentConnection(modeSession.assignedAgentId);
        if (modeAgentWs && modeAgentWs.readyState === 1) {
          modeAgentWs.send(JSON.stringify({
            type: 'set_mode',
            sessionId: sessionId,
            modeId: data.modeId,
          }));
        }
      }
      break;

    case "request_state":
      // Forward state request to agent
      const stateSession = await sessionRepository.findById(sessionId);
      if (stateSession?.assignedAgentId) {
        const stateAgentWs = agentService.getAgentConnection(stateSession.assignedAgentId);
        if (stateAgentWs && stateAgentWs.readyState === 1) {
          stateAgentWs.send(JSON.stringify({
            type: 'request_state',
            sessionId: sessionId,
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
