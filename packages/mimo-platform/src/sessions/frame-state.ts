import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type { MimoPaths } from "../context/mimo-context.js";

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

export function normalizeFrameState(
  state?: Partial<FrameState> | null,
): FrameState {
  return {
    leftFrame: {
      activeBufferId:
        state?.leftFrame?.activeBufferId ||
        DEFAULT_FRAME_STATE.leftFrame.activeBufferId,
    },
    rightFrame: {
      activeBufferId:
        state?.rightFrame?.activeBufferId ||
        DEFAULT_FRAME_STATE.rightFrame.activeBufferId,
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

// FrameStateService for path-dependent operations
export class FrameStateService {
  private paths: MimoPaths;

  constructor(paths: MimoPaths) {
    this.paths = paths;
  }

  private findSessionDir(sessionId: string): string | null {
    if (!existsSync(this.paths.projects)) {
      return null;
    }

    const projectEntries = readdirSync(this.paths.projects, {
      withFileTypes: true,
    });
    for (const projectEntry of projectEntries) {
      if (!projectEntry.isDirectory()) {
        continue;
      }

      const sessionsDir = join(
        this.paths.projects,
        projectEntry.name,
        "sessions",
      );
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

  loadNotes(sessionId: string): string {
    const sessionDir = this.findSessionDir(sessionId);
    if (!sessionDir) {
      return "";
    }

    const notesPath = join(sessionDir, "notes.txt");
    if (!existsSync(notesPath)) {
      return "";
    }

    return readFileSync(notesPath, "utf-8");
  }

  saveNotes(sessionId: string, content: string): void {
    const sessionDir = this.findSessionDir(sessionId);
    if (!sessionDir) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    const notesPath = join(sessionDir, "notes.txt");
    writeFileSync(notesPath, content, "utf-8");
  }

  loadProjectNotes(projectId: string): string {
    const projectPath = join(this.paths.projects, projectId);
    if (!existsSync(projectPath)) {
      return "";
    }

    const notesPath = join(projectPath, "notes.txt");
    if (!existsSync(notesPath)) {
      return "";
    }

    return readFileSync(notesPath, "utf-8");
  }

  saveProjectNotes(projectId: string, content: string): void {
    const projectPath = join(this.paths.projects, projectId);
    if (!existsSync(projectPath)) {
      mkdirSync(projectPath, { recursive: true });
    }

    const notesPath = join(projectPath, "notes.txt");
    writeFileSync(notesPath, content, "utf-8");
  }
}

// Factory function for creating FrameStateService with injected paths
export function createFrameStateService(paths: MimoPaths): FrameStateService {
  return new FrameStateService(paths);
}

// Legacy function exports - will be removed once all consumers use FrameStateService
// These use empty paths and will fail at runtime if called without proper initialization
export function loadNotes(sessionId: string): string {
  throw new Error(
    "loadNotes() requires FrameStateService - use createFrameStateService(paths) instead",
  );
}

export function saveNotes(sessionId: string, content: string): void {
  throw new Error(
    "saveNotes() requires FrameStateService - use createFrameStateService(paths) instead",
  );
}
