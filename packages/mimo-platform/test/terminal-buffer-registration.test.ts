import { describe, it, expect } from "bun:test";
import {
  ensureDefaultBuffersRegistered,
  getBuffersForFrame,
  getBufferById,
} from "../src/web/features/sessions/components/buffers/index.js";

describe("Terminal buffer registration", () => {
  it("the Terminal tab appears in the left frame after Chat and before Edit", () => {
    ensureDefaultBuffersRegistered();
    const leftBuffers = getBuffersForFrame("left");
    const ids = leftBuffers.map((b) => b.id);

    const chatIdx = ids.indexOf("chat");
    const terminalIdx = ids.indexOf("terminal");
    const editIdx = ids.indexOf("edit");

    expect(chatIdx).toBeGreaterThanOrEqual(0);
    expect(terminalIdx).toBeGreaterThanOrEqual(0);
    expect(editIdx).toBeGreaterThanOrEqual(0);
    expect(terminalIdx).toBe(chatIdx + 1);
    expect(editIdx).toBe(terminalIdx + 1);
  });

  it("Terminal buffer is registered with correct frame and name", () => {
    ensureDefaultBuffersRegistered();
    const buffer = getBufferById("terminal");
    expect(buffer).toBeDefined();
    expect(buffer!.name).toBe("Terminal");
    expect(buffer!.frame).toBe("left");
  });
});
