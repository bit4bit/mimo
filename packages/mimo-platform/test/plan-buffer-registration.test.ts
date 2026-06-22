import { describe, it, expect } from "bun:test";

describe("Plan buffer registration", () => {
  it("registers a Plan tab in the right frame next to MCP", async () => {
    const buffers =
      await import("../src/web/features/sessions/components/buffers/index.ts");
    buffers.ensureDefaultBuffersRegistered();

    const right = buffers.getBuffersForFrame("right");
    const ids = right.map((b: any) => b.id);

    expect(ids).toContain("plan");
    expect(ids).toContain("mcp-servers");

    const plan = right.find((b: any) => b.id === "plan");
    expect(plan?.name).toBe("Plan");
    expect(typeof plan?.component).toBe("function");
  });
});
