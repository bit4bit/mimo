// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync } from "fs";

const BLOCK_A = `function processItems(items: string[]): string[] {
  const result: string[] = [];
  for (const item of items) {
    result.push(item.trim().toLowerCase());
  }
  return result;
}`;

const BLOCK_B = `function handleItems(items: string[]): string[] {
  const result: string[] = [];
  for (const item of items) {
    result.push(item.trim().toLowerCase());
  }
  return result;
}`;

describe("ImpactCalculator duplication integration", () => {
  let upstreamDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    const base = join(
      tmpdir(),
      `mimo-calc-dup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    upstreamDir = join(base, "upstream");
    workspaceDir = join(base, "workspace");
    mkdirSync(upstreamDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
  });

  afterEach(() => {
    try {
      const base = join(upstreamDir, "..");
      rmSync(base, { recursive: true, force: true });
    } catch {}
  });

  it("detects duplication when two new files share the same code block", async () => {
    const { ImpactCalculator } = await import("../src/impact/calculator.ts");
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const { SccService } = await import("../src/impact/scc-service.ts");

    const sccBin = join(process.cwd(), "bin/scc");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const sccService = new SccService(sccBin, join(tmpdir(), "scc-cache"));
    const jscpdService = new JscpdService(jscpdBin);

    writeFileSync(join(workspaceDir, "module-a.ts"), BLOCK_A + "\n");
    writeFileSync(join(workspaceDir, "module-b.ts"), BLOCK_B + "\n");

    const calc = new ImpactCalculator(sccService, jscpdService);
    const { metrics } = await calc.calculateImpact(
      "session-1",
      upstreamDir,
      workspaceDir,
    );

    expect(metrics.duplication).toBeDefined();
    expect(metrics.duplication!.clones.length).toBeGreaterThan(0);
    expect(metrics.duplication!.duplicatedLines).toBeGreaterThan(0);
  });

  it("returns zero duplication for unique code changes", async () => {
    const { ImpactCalculator } = await import("../src/impact/calculator.ts");
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const { SccService } = await import("../src/impact/scc-service.ts");

    const sccBin = join(process.cwd(), "bin/scc");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const sccService = new SccService(sccBin, join(tmpdir(), "scc-cache"));
    const jscpdService = new JscpdService(jscpdBin);

    writeFileSync(
      join(workspaceDir, "unique.ts"),
      `export const x = 1;\nexport const y = 2;\n`,
    );

    const calc = new ImpactCalculator(sccService, jscpdService);
    const { metrics } = await calc.calculateImpact(
      "session-2",
      upstreamDir,
      workspaceDir,
    );

    expect(metrics.duplication).toBeDefined();
    expect(metrics.duplication!.clones).toHaveLength(0);
    expect(metrics.duplication!.duplicatedLines).toBe(0);
  });

  it("calculates duplication percentage relative to total changed lines", async () => {
    const { ImpactCalculator } = await import("../src/impact/calculator.ts");
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const { SccService } = await import("../src/impact/scc-service.ts");

    const sccBin = join(process.cwd(), "bin/scc");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const sccService = new SccService(sccBin, join(tmpdir(), "scc-cache"));
    const jscpdService = new JscpdService(jscpdBin);

    writeFileSync(join(workspaceDir, "file-a.ts"), BLOCK_A + "\n");
    writeFileSync(join(workspaceDir, "file-b.ts"), BLOCK_B + "\n");

    const calc = new ImpactCalculator(sccService, jscpdService);
    const { metrics } = await calc.calculateImpact(
      "session-3",
      upstreamDir,
      workspaceDir,
    );

    expect(metrics.duplication!.percentage).toBeGreaterThanOrEqual(0);
    expect(metrics.duplication!.percentage).toBeLessThanOrEqual(100);
  });

  it("groups clones by file in byFile map", async () => {
    const { ImpactCalculator } = await import("../src/impact/calculator.ts");
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const { SccService } = await import("../src/impact/scc-service.ts");

    const sccBin = join(process.cwd(), "bin/scc");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const sccService = new SccService(sccBin, join(tmpdir(), "scc-cache"));
    const jscpdService = new JscpdService(jscpdBin);

    writeFileSync(join(workspaceDir, "comp-a.ts"), BLOCK_A + "\n");
    writeFileSync(join(workspaceDir, "comp-b.ts"), BLOCK_B + "\n");

    const calc = new ImpactCalculator(sccService, jscpdService);
    const { metrics } = await calc.calculateImpact(
      "session-4",
      upstreamDir,
      workspaceDir,
    );

    expect(metrics.duplication!.byFile).toBeDefined();
    const fileKeys = Object.keys(metrics.duplication!.byFile);
    expect(fileKeys.length).toBeGreaterThan(0);
  });

  it("includes duplication data in returned ImpactMetrics", async () => {
    const { ImpactCalculator } = await import("../src/impact/calculator.ts");
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const { SccService } = await import("../src/impact/scc-service.ts");

    const sccBin = join(process.cwd(), "bin/scc");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const sccService = new SccService(sccBin, join(tmpdir(), "scc-cache"));
    const jscpdService = new JscpdService(jscpdBin);

    const calc = new ImpactCalculator(sccService, jscpdService);
    const { metrics } = await calc.calculateImpact(
      "session-5",
      upstreamDir,
      workspaceDir,
    );

    expect(metrics).toHaveProperty("duplication");
    expect(metrics.duplication).toMatchObject({
      duplicatedLines: expect.any(Number),
      duplicatedTokens: expect.any(Number),
      percentage: expect.any(Number),
      clones: expect.any(Array),
      byFile: expect.any(Object),
    });
  });
});
