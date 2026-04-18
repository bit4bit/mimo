import { registerBuffer } from "./registry.js";
import { ChatThreadsBuffer } from "./ChatThreadsBuffer.js";
import { NotesBuffer } from "./NotesBuffer.js";
import { ImpactBuffer } from "../components/ImpactBuffer.js";
import { McpServersBuffer } from "./McpServersBuffer.js";
import { EditBuffer } from "./EditBuffer.js";

let initialized = false;

export function ensureDefaultBuffersRegistered(): void {
  if (initialized) {
    return;
  }

  registerBuffer({
    id: "chat",
    name: "Chat",
    frame: "left",
    component: ChatThreadsBuffer,
  });

  registerBuffer({
    id: "notes",
    name: "Notes",
    frame: "right",
    component: NotesBuffer,
  });

  registerBuffer({
    id: "impact",
    name: "Impact",
    frame: "right",
    component: ImpactBuffer,
  });

  registerBuffer({
    id: "mcp-servers",
    name: "MCP",
    frame: "right",
    component: McpServersBuffer,
  });

  registerBuffer({
    id: "edit",
    name: "Edit",
    frame: "left",
    component: EditBuffer,
  });

  initialized = true;
}

export * from "./types.js";
export * from "./registry.js";
export * from "./ChatThreadsBuffer.js";
export * from "./NotesBuffer.js";
export * from "./EditBuffer.js";
