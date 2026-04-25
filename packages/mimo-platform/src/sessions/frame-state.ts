import type { MimoPaths } from "../context/mimo-context.js";
import type { OS } from "../os/types.js";

export interface FrameState {
  leftFrame: {
    activeBufferId: string;
  };
  rightFrame: {
    activeBufferId: string;
    isCollapsed: boolean;
  };
}

export const DEFAULT_FRAME_STATE: FrameState = {
  leftFrame: { activeBufferId: "chat" },
  rightFrame: { activeBufferId: "impact", isCollapsed: false },
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
      isCollapsed:
        typeof state?.rightFrame?.isCollapsed === "boolean"
          ? state.rightFrame.isCollapsed
          : DEFAULT_FRAME_STATE.rightFrame.isCollapsed,
    },
  };
}

export function updateFrameState(
  current: Partial<FrameState> | null | undefined,
  frame: "left" | "right",
  updates: { activeBufferId?: string; isCollapsed?: boolean },
): FrameState {
  const normalized = normalizeFrameState(current);
  if (frame === "left") {
    if (typeof updates.activeBufferId !== "string" || !updates.activeBufferId) {
      return normalized;
    }

    return {
      ...normalized,
      leftFrame: { activeBufferId: updates.activeBufferId },
    };
  }

  const nextRightFrame = { ...normalized.rightFrame };
  if (typeof updates.activeBufferId === "string" && updates.activeBufferId) {
    nextRightFrame.activeBufferId = updates.activeBufferId;
  }
  if (typeof updates.isCollapsed === "boolean") {
    nextRightFrame.isCollapsed = updates.isCollapsed;
  }

  return {
    ...normalized,
    rightFrame: nextRightFrame,
  };
}

// FrameStateService for path-dependent operations
export class FrameStateService {
  private paths: MimoPaths;
  private os: OS;

  constructor(paths: MimoPaths, os: OS) {
    this.paths = paths;
    this.os = os;
  }

  private findSessionDir(sessionId: string): string | null {
    if (!this.os.fs.exists(this.paths.projects)) {
      return null;
    }

    const projectEntries = this.os.fs.readdir(this.paths.projects, {
      withFileTypes: true,
    }) as Array<{ name: string; isDirectory(): boolean }>;
    for (const projectEntry of projectEntries) {
      if (!projectEntry.isDirectory()) {
        continue;
      }

      const sessionsDir = this.os.path.join(
        this.paths.projects,
        projectEntry.name,
        "sessions",
      );
      if (!this.os.fs.exists(sessionsDir)) {
        continue;
      }

      const sessionDir = this.os.path.join(sessionsDir, sessionId);
      if (this.os.fs.exists(sessionDir)) {
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

    const notesPath = this.os.path.join(sessionDir, "notes.txt");
    if (!this.os.fs.exists(notesPath)) {
      return "";
    }

    return this.os.fs.readFile(notesPath, "utf-8");
  }

  saveNotes(sessionId: string, content: string): void {
    const sessionDir = this.findSessionDir(sessionId);
    if (!sessionDir) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!this.os.fs.exists(sessionDir)) {
      this.os.fs.mkdir(sessionDir, { recursive: true });
    }

    const notesPath = this.os.path.join(sessionDir, "notes.txt");
    this.os.fs.writeFile(notesPath, content, "utf-8");
  }

  loadProjectNotes(projectId: string): string {
    const projectPath = this.os.path.join(this.paths.projects, projectId);
    if (!this.os.fs.exists(projectPath)) {
      return "";
    }

    const notesPath = this.os.path.join(projectPath, "notes.txt");
    if (!this.os.fs.exists(notesPath)) {
      return "";
    }

    return this.os.fs.readFile(notesPath, "utf-8");
  }

  saveProjectNotes(projectId: string, content: string): void {
    const projectPath = this.os.path.join(this.paths.projects, projectId);
    if (!this.os.fs.exists(projectPath)) {
      this.os.fs.mkdir(projectPath, { recursive: true });
    }

    const notesPath = this.os.path.join(projectPath, "notes.txt");
    this.os.fs.writeFile(notesPath, content, "utf-8");
  }
}

// Factory function for creating FrameStateService with injected paths
export function createFrameStateService(
  paths: MimoPaths,
  os: OS,
): FrameStateService {
  return new FrameStateService(paths, os);
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
