import { describe, it, expect } from "bun:test";
import {
  validateImpactMetrics,
  type ImpactMetrics,
} from "../src/impact/calculator.ts";

function baseMetrics(): ImpactMetrics {
  return {
    files: { new: 1, changed: 0, deleted: 0, unchanged: 0 },
    linesOfCode: { added: 10, removed: 2, net: 8 },
    complexity: { cyclomatic: 3, cognitive: 0, estimatedMinutes: 1 },
    absoluteComplexity: { upstream: 7, workspace: 10 },
    byLanguage: [],
    byFile: [],
  };
}

describe("impact metric validation", () => {
  it("returns ok for invariant-consistent metrics", () => {
    const result = validateImpactMetrics(baseMetrics());
    expect(result.status).toBe("ok");
    expect(result.errors).toHaveLength(0);
  });

  it("returns warning when complexity delta invariant is violated", () => {
    const metrics = baseMetrics();
    metrics.complexity.cyclomatic = 99;

    const result = validateImpactMetrics(metrics);
    expect(result.status).toBe("warning");
    expect(result.errors.join(" ")).toContain("complexity_delta_mismatch");
  });

  it("returns warning when loc net invariant is violated", () => {
    const metrics = baseMetrics();
    metrics.linesOfCode.net = 999;

    const result = validateImpactMetrics(metrics);
    expect(result.status).toBe("warning");
    expect(result.errors.join(" ")).toContain("loc_net_mismatch");
  });
});
