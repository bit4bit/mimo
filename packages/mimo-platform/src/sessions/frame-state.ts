import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getPaths } from "../config/paths.js";

export interface FrameState {
  leftFrame: {
    activeBufferId: string;
  };
  rightFrame: {
    activeBufferId: string;
  };
}

export const DEFAULT_FRAME_STATE: FrameState = {
  leftFrame: { activeBufferId: "chat" },
  rightFrame: { activeBufferId: "impact" },
};

export function createDefaultFrameState(): FrameState {
  return {
    leftFrame: { ...DEFAULT_FRAME_STATE.leftFrame },
    rightFrame: { ...DEFAULT_FRAME_STATE.rightFrame },
  };
}

export function normalizeFrameState(state?: Partial<FrameState> | null): FrameState {
  return {
    leftFrame: {
      activeBufferId: state?.leftFrame?.activeBufferId || DEFAULT_FRAME_STATE.leftFrame.activeBufferId,
    },
    rightFrame: {
      activeBufferId: state?.rightFrame?.activeBufferId || DEFAULT_FRAME_STATE.rightFrame.activeBufferId,
    },
  };
}

export function updateFrameState(
  current: Partial<FrameState> | null | undefined,
  frame: "left" | "right",
  activeBufferId: string,
): FrameState {
  const normalized = normalizeFrameState(current);
  if (frame === "left") {
    return {
      ...normalized,
      leftFrame: { activeBufferId },
    };
  }

  return {
    ...normalized,
    rightFrame: { activeBufferId },
  };
}

function findSessionDir(sessionId: string): string | null {
  const paths = getPaths();
  if (!existsSync(paths.projects)) {
    return null;
  }

  const projectEntries = readdirSync(paths.projects, { withFileTypes: true });
  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) {
      continue;
    }

    const sessionsDir = join(paths.projects, projectEntry.name, "sessions");
    if (!existsSync(sessionsDir)) {
      continue;
    }

    const sessionDir = join(sessionsDir, sessionId);
    if (existsSync(sessionDir)) {
      return sessionDir;
    }
  }

  return null;
}

export function loadNotes(sessionId: string): string {
  const sessionDir = findSessionDir(sessionId);
  if (!sessionDir) {
    return "";
  }

  const notesPath = join(sessionDir, "notes.txt");
  if (!existsSync(notesPath)) {
    return "";
  }

  return readFileSync(notesPath, "utf-8");
}

export function saveNotes(sessionId: string, content: string): void {
  const sessionDir = findSessionDir(sessionId);
  if (!sessionDir) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }

  const notesPath = join(sessionDir, "notes.txt");
  writeFileSync(notesPath, content, "utf-8");
}
