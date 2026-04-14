import { registerBuffer } from "./registry.js";
import { ChatBuffer } from "./ChatBuffer.js";
import { NotesBuffer } from "./NotesBuffer.js";
import { ImpactBuffer } from "../components/ImpactBuffer.js";
import { McpServersBuffer } from "./McpServersBuffer.js";

let initialized = false;

export function ensureDefaultBuffersRegistered(): void {
  if (initialized) {
    return;
  }

  registerBuffer({
    id: "chat",
    name: "Chat",
    frame: "left",
    component: ChatBuffer,
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

  initialized = true;
}

export * from "./types.js";
export * from "./registry.js";
export * from "./ChatBuffer.js";
export * from "./NotesBuffer.js";
