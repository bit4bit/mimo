import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { createOS } from "../src/os/node-adapter.js";

describe("SCC Determinism Test", () => {
  let testHome: string;
  let testDir: string;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-scc-determinism-${Date.now()}`);
    testDir = join(testHome, "test-project");

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    mkdirSync(testDir, { recursive: true });

    // Create stable test files with realistic content
    writeFileSync(
      join(testDir, "main.ts"),
      `function hello(): string {
  return "Hello, World!";
}

function add(a: number, b: number): number {
  return a + b;
}

console.log(hello());
console.log(add(1, 2));
`,
    );

    writeFileSync(
      join(testDir, "utils.ts"),
      `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export function multiply(x: number, y: number): number {
  return x * y;
}
`,
    );
  });

  afterEach(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  it("should return identical SCC results on identical files", async () => {
    const { SccService } = await import("../src/impact/scc-service.ts");
    const sccPath = join(
      process.env.HOME || "/usr/local/bin",
      ".mimo",
      "bin",
      "scc",
    );
    const os = createOS({ ...process.env });
    const service = new SccService(os, sccPath);

    if (!service.isInstalled()) {
      console.log("SCC not installed, skipping test");
      return;
    }

    // Run SCC multiple times on the same directory
    const results = [];
    for (let i = 0; i < 5; i++) {
      service.clearCache(testDir);
      const metrics = await service.runScc(testDir);
      results.push(metrics);

      // Sort files by path for consistent comparison
      const sortedFiles = [...metrics.byFile].sort((a, b) =>
        a.path.localeCompare(b.path),
      );
      console.log(`Run ${i}:`, {
        loc: metrics.linesOfCode.net,
        complexity: metrics.complexity.cyclomatic,
        files: metrics.byFile.length,
        langs: metrics.byLanguage.length,
        sortedByPath: sortedFiles.map((f) => `${f.path}(${f.code})`).join(", "),
      });
    }

    // Check aggregate totals are identical
    for (let i = 1; i < results.length; i++) {
      expect(results[i].linesOfCode.net).toBe(results[0].linesOfCode.net);
      expect(results[i].complexity.cyclomatic).toBe(
        results[0].complexity.cyclomatic,
      );
      expect(results[i].byFile.length).toBe(results[0].byFile.length);
    }

    // Check per-file metrics (sort by path for stable comparison)
    for (let i = 1; i < results.length; i++) {
      const sortedCurrent = [...results[i].byFile].sort((a, b) =>
        a.path.localeCompare(b.path),
      );
      const sortedBase = [...results[0].byFile].sort((a, b) =>
        a.path.localeCompare(b.path),
      );

      for (let j = 0; j < sortedCurrent.length; j++) {
        if (sortedCurrent[j].code !== sortedBase[j].code) {
          console.log(
            `Mismatch at file ${sortedCurrent[j].path}: run ${i} has code=${sortedCurrent[j].code}, run 0 has code=${sortedBase[j].code}`,
          );
        }
        expect(sortedCurrent[j].code).toBe(sortedBase[j].code);
        expect(sortedCurrent[j].complexity).toBe(sortedBase[j].complexity);
        expect(sortedCurrent[j].path).toBe(sortedBase[j].path);
      }
    }

    console.log(
      "✓ SCC is deterministic - all 5 runs produced identical results",
    );
  });

  it("should return identical delta calculations on unchanged files", async () => {
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

    const upstreamDir = join(testHome, "upstream");
    const workspaceDir = join(testHome, "workspace");
    mkdirSync(upstreamDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });

    // Create identical files in both directories
    const file1 = `function test(): void {
  console.log("test");
}
`;
    writeFileSync(join(upstreamDir, "test.ts"), file1);
    writeFileSync(join(workspaceDir, "test.ts"), file1);

    // Run impact calculation 5 times
    const results = [];
    for (let i = 0; i < 5; i++) {
      const result = await calculator.calculateImpact(
        "test-session",
        upstreamDir,
        workspaceDir,
      );
      results.push(result);
      console.log(`Run ${i}:`, {
        changed: result.metrics.files.changed,
        new: result.metrics.files.new,
        deleted: result.metrics.files.deleted,
        locAdded: result.metrics.linesOfCode.added,
        locRemoved: result.metrics.linesOfCode.removed,
        delta: result.metrics.complexity.cyclomatic,
      });
    }

    // All results should show zero changes (files are identical)
    for (let i = 1; i < results.length; i++) {
      expect(results[i].metrics.files.changed).toBe(0);
      expect(results[i].metrics.files.new).toBe(0);
      expect(results[i].metrics.files.deleted).toBe(0);
      expect(results[i].metrics.linesOfCode.added).toBe(0);
      expect(results[i].metrics.linesOfCode.removed).toBe(0);
      expect(results[i].metrics.complexity.cyclomatic).toBe(0);
    }

    console.log("✓ Impact calculator is deterministic on unchanged files");
  });
});
