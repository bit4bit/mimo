import type { BufferConfig, FrameId } from "./types.js";

const registry: BufferConfig[] = [];

export function registerBuffer(config: BufferConfig): void {
  const existingIndex = registry.findIndex((buffer) => buffer.id === config.id);
  if (existingIndex >= 0) {
    registry[existingIndex] = config;
    return;
  }

  registry.push(config);
}

export function getBuffersForFrame(frameId: FrameId): BufferConfig[] {
  return registry.filter((buffer) => buffer.frame === frameId);
}

export function getBufferById(id: string): BufferConfig | undefined {
  return registry.find((buffer) => buffer.id === id);
}
