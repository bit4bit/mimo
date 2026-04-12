import { registerBuffer } from "./registry.js";
import { ChatBuffer } from "./ChatBuffer.js";
import { NotesBuffer } from "./NotesBuffer.js";
import { ImpactBuffer } from "../components/ImpactBuffer.js";

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

  initialized = true;
}

export * from "./types.js";
export * from "./registry.js";
export * from "./ChatBuffer.js";
export * from "./NotesBuffer.js";
