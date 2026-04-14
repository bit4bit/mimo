// Session state management (in-memory only)
// Model and mode state is stored here and accessed by both the WebSocket handlers and HTTP routes

export interface SessionModelState {
  currentModelId: string;
  availableModels: Array<{ value: string; name: string; description?: string }>;
  optionId: string;
}

export interface SessionModeState {
  currentModeId: string;
  availableModes: Array<{ value: string; name: string; description?: string }>;
  optionId: string;
}

// In-memory state storage
const sessionModelStates = new Map<string, SessionModelState>();
const sessionModeStates = new Map<string, SessionModeState>();
const sessionFossilPorts = new Map<string, number>();

export const sessionStateService = {
  // Set model state for a session
  setModelState(sessionId: string, state: SessionModelState): void {
    sessionModelStates.set(sessionId, state);
  },

  // Set mode state for a session
  setModeState(sessionId: string, state: SessionModeState): void {
    sessionModeStates.set(sessionId, state);
  },

  // Get model state for a session
  getModelState(sessionId: string): SessionModelState | undefined {
    return sessionModelStates.get(sessionId);
  },

  // Get mode state for a session
  getModeState(sessionId: string): SessionModeState | undefined {
    return sessionModeStates.get(sessionId);
  },

  // Set fossil port for a session
  setFossilPort(sessionId: string, port: number): void {
    sessionFossilPorts.set(sessionId, port);
  },

  // Get fossil port for a session
  getFossilPort(sessionId: string): number | undefined {
    return sessionFossilPorts.get(sessionId);
  },

  // Clear state for a session (when session is deleted)
  clearSessionState(sessionId: string): void {
    sessionModelStates.delete(sessionId);
    sessionModeStates.delete(sessionId);
    sessionFossilPorts.delete(sessionId);
  },
};
