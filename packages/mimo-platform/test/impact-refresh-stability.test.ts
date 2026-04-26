import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { createOS } from "../src/os/node-adapter.js";

interface NormalizedMetrics {
  files: {
    new: number;
    changed: number;
    deleted: number;
    unchanged: number;
  };
  linesOfCode: {
    added: number;
    removed: number;
    net: number;
  };
  complexity: {
    cyclomatic: number;
    cognitive: number;
  };
  absoluteComplexity: {
    upstream: number;
    workspace: number;
  };
  byLanguage: Array<{
    language: string;
    files: number;
    linesAdded: number;
    linesRemoved: number;
    complexityDelta: number;
  }>;
}

function normalizeMetrics(metrics: any): NormalizedMetrics {
  const byLanguage = [...(metrics.byLanguage || [])]
    .map((l: any) => ({
      language: l.language,
      files: l.files,
      linesAdded: l.linesAdded,
      linesRemoved: l.linesRemoved,
      complexityDelta: l.complexityDelta,
    }))
    .sort((a, b) => a.language.localeCompare(b.language));

  return {
    files: { ...metrics.files },
    linesOfCode: { ...metrics.linesOfCode },
    complexity: {
      cyclomatic: metrics.complexity.cyclomatic,
      cognitive: metrics.complexity.cognitive,
    },
    absoluteComplexity: { ...metrics.absoluteComplexity },
    byLanguage,
  };
}

function createJscpdDisabledStub() {
  return {
    isInstalled: () => false,
    runOnFiles: async () => ({
      duplicatedLines: 0,
      duplicatedTokens: 0,
      percentage: 0,
      clones: [],
    }),
  };
}

describe("Impact refresh stability", () => {
  let testHome: string;
  let upstreamDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-impact-refresh-stability-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    upstreamDir = join(testHome, "upstream");
    workspaceDir = join(testHome, "workspace");

    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    mkdirSync(upstreamDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });

    const writeIgnoreScaffold = (dir: string) => {
      mkdirSync(join(dir, ".fossil-settings"), { recursive: true });
      writeFileSync(join(dir, ".fossil-settings", "ignore-glob"), "");
      writeFileSync(join(dir, ".gitignore"), "");
      writeFileSync(join(dir, ".mimoignore"), "");
    };
    writeIgnoreScaffold(upstreamDir);
    writeIgnoreScaffold(workspaceDir);

    writeFileSync(
      join(upstreamDir, "main.ts"),
      `export function score(a: number, b: number): number {
  if (a > b) return a - b;
  if (a === b) return 0;
  return b - a;
}
`,
    );

    writeFileSync(
      join(upstreamDir, "util.ts"),
      `export function format(v: number): string {
  return String(v);
}
`,
    );

    writeFileSync(join(workspaceDir, "main.ts"), readFileSync(join(upstreamDir, "main.ts"), "utf8"));
    writeFileSync(join(workspaceDir, "util.ts"), readFileSync(join(upstreamDir, "util.ts"), "utf8"));
  });

  afterEach(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors in tests
    }
  });

  it("returns identical metrics across repeated forced refresh with no file changes", async () => {
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
    const jscpdDisabled = createJscpdDisabledStub();

    if (!sccService.isInstalled()) {
      console.log("SCC not installed, skipping test");
      return;
    }

    const calculator = new ImpactCalculator(sccService, jscpdDisabled as any, os);
    const runs: NormalizedMetrics[] = [];

    for (let i = 0; i < 10; i++) {
      const result = await calculator.calculateImpact(
        "refresh-stability-no-change",
        upstreamDir,
        workspaceDir,
        true,
      );
      runs.push(normalizeMetrics(result.metrics));
    }

    const baseline = runs[0];
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(baseline);
    }
  });

  it("keeps delta and absolute complexity mathematically consistent on every refresh", async () => {
    const { ImpactCalculator } = await import("../src/impact/calculator.ts");
    const { SccService } = await import("../src/impact/scc-service.ts");

    writeFileSync(
      join(workspaceDir, "main.ts"),
      `export function score(a: number, b: number): number {
  if (a > b) {
    if (a % 2 === 0) return a - b;
    return a + b;
  }
  if (a === b) return 0;
  if (b > 10) return b - a;
  return b * 2 - a;
}
`,
    );

    const sccPath = join(
      process.env.HOME || "/usr/local/bin",
      ".mimo",
      "bin",
      "scc",
    );
    const os = createOS({ ...process.env });
    const sccService = new SccService(os, sccPath);
    const jscpdDisabled = createJscpdDisabledStub();

    if (!sccService.isInstalled()) {
      console.log("SCC not installed, skipping test");
      return;
    }

    const calculator = new ImpactCalculator(sccService, jscpdDisabled as any, os);

    for (let i = 0; i < 10; i++) {
      const { metrics } = await calculator.calculateImpact(
        "refresh-stability-modified",
        upstreamDir,
        workspaceDir,
        true,
      );

      expect(metrics.complexity.cyclomatic).toBe(
        metrics.absoluteComplexity.workspace - metrics.absoluteComplexity.upstream,
      );
    }
  });

  it("ignores runtime file churn in workspace for impact metrics", async () => {
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
    const jscpdDisabled = createJscpdDisabledStub();

    if (!sccService.isInstalled()) {
      console.log("SCC not installed, skipping test");
      return;
    }

    const runtimeDir = join(workspaceDir, ".mimo", "runtime");
    mkdirSync(runtimeDir, { recursive: true });

    const calculator = new ImpactCalculator(sccService, jscpdDisabled as any, os);

    const before = await calculator.calculateImpact(
      "refresh-stability-runtime-churn",
      upstreamDir,
      workspaceDir,
      true,
    );

    writeFileSync(
      join(runtimeDir, "heartbeat.ts"),
      `export const pulse = ${Date.now()};\n`,
    );

    const after = await calculator.calculateImpact(
      "refresh-stability-runtime-churn",
      upstreamDir,
      workspaceDir,
      true,
    );

    const changed =
      before.metrics.files.new !== after.metrics.files.new ||
      before.metrics.linesOfCode.added !== after.metrics.linesOfCode.added ||
      before.metrics.complexity.cyclomatic !== after.metrics.complexity.cyclomatic;

    expect(changed).toBe(false);
  });
});
