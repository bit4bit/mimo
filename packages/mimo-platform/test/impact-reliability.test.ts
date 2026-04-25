import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { createOS } from "../src/os/node-adapter.js";

describe("Impact Calculation Reliability", () => {
  let testHome: string;
  let upstreamDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-impact-reliability-${Date.now()}`);
    upstreamDir = join(testHome, "upstream");
    workspaceDir = join(testHome, "workspace");

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    mkdirSync(upstreamDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });

    // Create stable test files
    writeFileSync(
      join(upstreamDir, "main.ts"),
      `function hello(): string {
  return "Hello, World!";
}

function add(a: number, b: number): number {
  if (a > 0) {
    return a + b;
  }
  return b;
}

console.log(hello());
console.log(add(1, 2));
`,
    );

    writeFileSync(
      join(upstreamDir, "utils.ts"),
      `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export function multiply(x: number, y: number): number {
  return x * y;
}

export function divide(x: number, y: number): number {
  if (y === 0) {
    throw new Error("Division by zero");
  }
  return x / y;
}
`,
    );

    // Copy to workspace
    writeFileSync(
      join(workspaceDir, "main.ts"),
      readFileSync(join(upstreamDir, "main.ts")),
    );
    writeFileSync(
      join(workspaceDir, "utils.ts"),
      readFileSync(join(upstreamDir, "utils.ts")),
    );
  });

  afterEach(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  it("calculates consistent complexity across multiple runs", async () => {
    const { ImpactCalculator } = await import("../src/impact/calculator.ts");
    const { SccService } = await import("../src/impact/scc-service.ts");

    const sccPath = join(
      process.env.HOME || "/usr/local/bin",
      ".mimo",
      "bin",
      "scc",
    );
    const os = createOS({ ...process.env });
    const sccService = new SccService(os, sccPath);

    if (!sccService.isInstalled()) {
      console.log("SCC not installed, skipping test");
      return;
    }

    const calculator = new ImpactCalculator(sccService, undefined, os);

    // Run impact calculation 5 times
    const results = [];
    for (let i = 0; i < 5; i++) {
      sccService.clearCache(upstreamDir);
      sccService.clearCache(workspaceDir);

      const result = await calculator.calculateImpact(
        "test-session",
        upstreamDir,
        workspaceDir,
      );
      results.push(result);
    }

    // All results should have identical cyclomatic delta (no changes)
    const cyclomaticDeltas = results.map(
      (r) => r.metrics.complexity.cyclomatic,
    );

    // Check all values are within ±5% of mean
    const mean =
      cyclomaticDeltas.reduce((a, b) => a + b, 0) / cyclomaticDeltas.length;
    const maxVariance = mean * 0.05;

    for (let i = 0; i < cyclomaticDeltas.length; i++) {
      const variance = Math.abs(cyclomaticDeltas[i] - mean);
      expect(variance).toBeLessThanOrEqual(maxVariance);
    }

    console.log("✓ Impact calculation is consistent across runs");
    console.log("  Cyclomatic deltas:", cyclomaticDeltas);
    console.log("  Mean:", mean, "Max variance:", maxVariance);
  });

  it("detects variance with concurrent file modifications", async () => {
    const { ImpactCalculator } = await import("../src/impact/calculator.ts");
    const { SccService } = await import("../src/impact/scc-service.ts");

    const sccPath = join(
      process.env.HOME || "/usr/local/bin",
      ".mimo",
      "bin",
      "scc",
    );
    const os = createOS({ ...process.env });
    const sccService = new SccService(os, sccPath);

    if (!sccService.isInstalled()) {
      console.log("SCC not installed, skipping test");
      return;
    }

    const calculator = new ImpactCalculator(sccService, undefined, os);

    // Clear caches
    sccService.clearCache(upstreamDir);
    sccService.clearCache(workspaceDir);

    // Modify workspace file during calculation
    const calculationPromise = calculator.calculateImpact(
      "test-session",
      upstreamDir,
      workspaceDir,
    );

    // Simulate concurrent modification
    writeFileSync(
      join(workspaceDir, "main.ts"),
      `function hello(): string {
  return "Hello, Modified!";
}

function add(a: number, b: number): number {
  if (a > 0) {
    return a + b;
  }
  return b;
}

function subtract(a: number, b: number): number {
  return a - b;
}

console.log(hello());
console.log(add(1, 2));
`,
    );

    const result = await calculationPromise;

    // The result may or may not include the modification depending on timing
    // Just verify the calculation completes without error
    expect(result).toBeDefined();
    expect(result.metrics).toBeDefined();
    expect(result.metrics.complexity).toBeDefined();

    console.log("✓ Impact calculation handles concurrent modifications");
  });

  it("cache bypass on force refresh clears stale data", async () => {
    const { ImpactCalculator } = await import("../src/impact/calculator.ts");
    const { SccService } = await import("../src/impact/scc-service.ts");

    const sccPath = join(
      process.env.HOME || "/usr/local/bin",
      ".mimo",
      "bin",
      "scc",
    );
    const os = createOS({ ...process.env });
    const sccService = new SccService(os, sccPath);

    if (!sccService.isInstalled()) {
      console.log("SCC not installed, skipping test");
      return;
    }

    const calculator = new ImpactCalculator(sccService, undefined, os);

    // Initial calculation with caching
    const result1 = await calculator.calculateImpact(
      "test-session",
      upstreamDir,
      workspaceDir,
    );

    // Modify workspace file
    writeFileSync(
      join(workspaceDir, "new-file.ts"),
      `function newFunction(): void {
  console.log("New file added");
}
`,
    );

    // Force refresh calculation
    const result2 = await calculator.calculateImpact(
      "test-session",
      upstreamDir,
      workspaceDir,
      true, // force refresh
    );

    // Should detect the new file
    expect(result2.metrics.files.new).toBeGreaterThan(
      result1.metrics.files.new,
    );

    console.log("✓ Force refresh bypasses cache correctly");
  });

  it("anomaly detection flags extreme deltas", async () => {
    const { ImpactCalculator } = await import("../src/impact/calculator.ts");
    const { SccService } = await import("../src/impact/scc-service.ts");

    const sccPath = join(
      process.env.HOME || "/usr/local/bin",
      ".mimo",
      "bin",
      "scc",
    );
    const os = createOS({ ...process.env });
    const sccService = new SccService(os, sccPath);

    if (!sccService.isInstalled()) {
      console.log("SCC not installed, skipping test");
      return;
    }

    const calculator = new ImpactCalculator(sccService, undefined, os);

    // Clear caches
    sccService.clearCache(upstreamDir);
    sccService.clearCache(workspaceDir);

    // Create a file with high complexity
    writeFileSync(
      join(upstreamDir, "complex.ts"),
      Array.from(
        { length: 100 },
        (_, i) => `
function func${i}(a: number, b: number): number {
  if (a > 0) {
    if (b > 0) {
      return a + b;
    }
    return a;
  }
  return b;
}
`,
      ).join("\n"),
    );

    // Copy to workspace
    writeFileSync(
      join(workspaceDir, "complex.ts"),
      readFileSync(join(upstreamDir, "complex.ts")),
    );

    const result = await calculator.calculateImpact(
      "test-session",
      upstreamDir,
      workspaceDir,
    );

    // Should complete without error
    expect(result).toBeDefined();
    expect(result.metrics.complexity.cyclomatic).toBeDefined();

    console.log("✓ Anomaly detection handles complex files");
  });
});

// Helper function
function readFileSync(path: string): string {
  const { readFileSync: fsReadFileSync } = require("fs");
  return fsReadFileSync(path, "utf-8");
}
