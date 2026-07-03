// SPDX-License-Identifier: AGPL-3.0-only
import { registerBuffer } from "./registry.js";
import { ChatThreadsBuffer } from "./ChatThreadsBuffer.js";
import { NotesBuffer } from "./NotesBuffer.js";
import { FileTreeBuffer } from "./FileTreeBuffer.js";
import { ImpactBuffer } from "../ImpactBuffer.js";
import { McpServersBuffer } from "./McpServersBuffer.js";
import { PlanBuffer } from "./PlanBuffer.js";
import { EditBuffer } from "./EditBuffer.js";
import { PatchBuffer } from "./PatchBuffer.js";
import { SummaryBuffer } from "../SummaryBuffer.js";

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
    id: "file-tree",
    name: "Files",
    frame: "right",
    component: FileTreeBuffer,
  });

  registerBuffer({
    id: "impact",
    name: "Impact",
    frame: "right",
    component: ImpactBuffer,
  });

  registerBuffer({
    id: "summary",
    name: "Summary",
    frame: "right",
    component: SummaryBuffer,
  });

  registerBuffer({
    id: "mcp-servers",
    name: "MCP",
    frame: "right",
    component: McpServersBuffer,
  });

  registerBuffer({
    id: "plan",
    name: "Plan",
    frame: "right",
    component: PlanBuffer,
  });

  registerBuffer({
    id: "edit",
    name: "Edit",
    frame: "left",
    component: EditBuffer,
  });

  registerBuffer({
    id: "patches",
    name: "Patches",
    frame: "left",
    component: PatchBuffer,
  });

  initialized = true;
}

export * from "./types.js";
export * from "./registry.js";
export * from "./ChatThreadsBuffer.js";
export * from "./NotesBuffer.js";
export * from "./FileTreeBuffer.js";
export * from "./EditBuffer.js";
export * from "./PatchBuffer.js";
