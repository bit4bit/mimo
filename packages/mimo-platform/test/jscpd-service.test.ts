// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync } from "fs";

// Duplicated block used across multiple test files
const DUPLICATED_BLOCK = `function compute(x: number, y: number): number {
  const result = x + y;
  const doubled = result * 2;
  const final = doubled + 1;
  return final;
}`;

describe("JscpdService", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `mimo-jscpd-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("initializes with a binary path", async () => {
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const service = new JscpdService(jscpdBin);
    expect(service.getJscpdPath()).toBe(jscpdBin);
  });

  it("reports as installed when binary exists", async () => {
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const service = new JscpdService(jscpdBin);
    expect(service.isInstalled()).toBe(true);
  });

  it("parses cross-file duplicates from jscpd output", async () => {
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const service = new JscpdService(jscpdBin);

    // Write two files with the same block
    const fileA = join(testDir, "a.ts");
    const fileB = join(testDir, "b.ts");
    writeFileSync(fileA, DUPLICATED_BLOCK + "\n");
    writeFileSync(fileB, DUPLICATED_BLOCK + "\n");

    const metrics = await service.runOnFiles([fileA, fileB], testDir);

    expect(metrics.clones.length).toBeGreaterThan(0);
    expect(metrics.duplicatedLines).toBeGreaterThan(0);

    const clone = metrics.clones[0];
    expect(clone.type).toBe("cross");
    expect(clone.firstFile.path).toContain("a.ts");
    expect(clone.secondFile.path).toContain("b.ts");
  });

  it("parses intra-file duplicates from jscpd output", async () => {
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const service = new JscpdService(jscpdBin);

    // Write a single file with the same block twice
    const fileA = join(testDir, "intra.ts");
    writeFileSync(
      fileA,
      DUPLICATED_BLOCK +
        "\n\n" +
        DUPLICATED_BLOCK.replace("compute", "compute2") +
        "\n",
    );

    const metrics = await service.runOnFiles([fileA], testDir);

    expect(metrics.clones.length).toBeGreaterThan(0);
    const intraClone = metrics.clones.find((c) => c.type === "intra");
    expect(intraClone).toBeDefined();
    expect(intraClone!.firstFile.path).toBe(intraClone!.secondFile.path);
  });

  it("returns empty metrics when no duplicates exist", async () => {
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const service = new JscpdService(jscpdBin);

    const fileA = join(testDir, "unique.ts");
    writeFileSync(fileA, `export const a = 1;\nexport const b = 2;\n`);

    const metrics = await service.runOnFiles([fileA], testDir);

    expect(metrics.clones).toHaveLength(0);
    expect(metrics.duplicatedLines).toBe(0);
    expect(metrics.duplicatedTokens).toBe(0);
  });

  it("builds composite ignore file from gitignore and mimoignore", async () => {
    const { JscpdService } = await import("../src/impact/jscpd-service.ts");
    const jscpdBin = join(process.cwd(), "node_modules/.bin/jscpd");
    const service = new JscpdService(jscpdBin);

    writeFileSync(join(testDir, ".gitignore"), "node_modules\ndist\n");
    writeFileSync(join(testDir, ".mimoignore"), "*.generated.ts\n");

    const ignorePath = await service.buildIgnoreFile(testDir);

    const { readFileSync } = await import("fs");
    const content = readFileSync(ignorePath, "utf-8");
    expect(content).toContain("node_modules");
    expect(content).toContain("*.generated.ts");
  });
});
