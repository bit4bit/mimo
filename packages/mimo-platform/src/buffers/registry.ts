// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

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
