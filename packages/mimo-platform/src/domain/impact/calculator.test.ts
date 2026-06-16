// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Integration tests for incremental impact calculation.
 *
 * Verifies that incremental metrics (based on changed files plus a cached
 * baseline) match the metrics produced by a full scan for the same workspace.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockOS, type MockOS } from "../../infrastructure/os/mock-adapter.js";
import { ImpactCalculator } from "./calculator.js";
import type { SccMetrics, SccService } from "./scc-service.js";
import type { JscpdMetrics, JscpdService } from "./jscpd-service.js";

function createSccFileMetrics(
  path: string,
  language: string,
  lines: number,
  code: number,
  complexity: number,
) {
  return {
    path,
    language,
    lines,
    code,
    comment: 0,
    blank: lines - code,
    complexity,
  };
}

function createSccMetrics(
  files: ReturnType<typeof createSccFileMetrics>[],
): SccMetrics {
  const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
  const totalCode = files.reduce((sum, f) => sum + f.code, 0);
  const totalComplexity = files.reduce((sum, f) => sum + f.complexity, 0);
  const languageMap = new Map<string, any>();
  for (const file of files) {
    const existing = languageMap.get(file.language);
    if (existing) {
      existing.files++;
      existing.lines += file.lines;
      existing.code += file.code;
      existing.complexity += file.complexity;
    } else {
      languageMap.set(file.language, {
        language: file.language,
        files: 1,
        lines: file.lines,
        code: file.code,
        comment: 0,
        blank: file.blank,
        complexity: file.complexity,
      });
    }
  }
  return {
    linesOfCode: { added: totalCode, removed: 0, net: totalCode },
    totalLines: { upstream: totalLines, workspace: totalLines },
    complexity: {
      cyclomatic: totalComplexity,
      cognitive: 0,
      estimatedMinutes: Math.ceil(totalCode / 10),
    },
    byLanguage: Array.from(languageMap.values()),
    byFile: files,
  };
}

function createMockSccService(
  fullRuns: Map<string, SccMetrics>,
  fileRuns: Map<string, SccMetrics>,
): SccService {
  return {
    isInstalled: () => true,
    install: async () => {},
    runScc: async (directory: string) => {
      const metrics = fullRuns.get(directory);
      if (!metrics) throw new Error(`No mock runScc for ${directory}`);
      return metrics;
    },
    runSccOnFiles: async (filePaths: string[], directory: string) => {
      const key = `${directory}:${filePaths.sort().join(":")}`;
      const metrics = fileRuns.get(key);
      if (!metrics) throw new Error(`No mock runSccOnFiles for ${key}`);
      return metrics;
    },
  } as unknown as SccService;
}

function createMockJscpdService(): JscpdService {
  return {
    isInstalled: () => false,
    runOnFiles: async () => ({
      duplicatedLines: 0,
      duplicatedTokens: 0,
      percentage: 0,
      clones: [],
    }),
  } as unknown as JscpdService;
}

describe("ImpactCalculator incremental impact", () => {
  let os: MockOS;
  const upstreamPath = "/upstream";
  const workspacePath = "/workspace";

  beforeEach(() => {
    os = createMockOS() as MockOS;
    os.fs.seed({
      [upstreamPath]: null,
      [workspacePath]: null,
      [`${upstreamPath}/src`]: null,
      [`${workspacePath}/src`]: null,
      [`${upstreamPath}/src/app.ts`]: "line1\nline2\nline3",
      [`${workspacePath}/src/app.ts`]: "line1\nline2\nline3\nline4",
      [`${upstreamPath}/src/removed.ts`]: "a\nb",
      [`${workspacePath}/src/new.ts`]: "x\ny\nz",
    });
  });

  it("incremental metrics match full-scan metrics for a small repo", async () => {
    const upstreamMetrics = createSccMetrics([
      createSccFileMetrics("src/app.ts", "TypeScript", 3, 3, 2),
      createSccFileMetrics("src/removed.ts", "TypeScript", 2, 2, 1),
    ]);

    const workspaceMetrics = createSccMetrics([
      createSccFileMetrics("src/app.ts", "TypeScript", 4, 4, 3),
      createSccFileMetrics("src/new.ts", "TypeScript", 3, 3, 1),
    ]);

    const changedFilesMetrics = createSccMetrics([
      createSccFileMetrics("src/app.ts", "TypeScript", 4, 4, 3),
      createSccFileMetrics("src/new.ts", "TypeScript", 3, 3, 1),
    ]);

    const fullRuns = new Map([
      [upstreamPath, upstreamMetrics],
      [workspacePath, workspaceMetrics],
    ]);
    const fileRuns = new Map([
      [
        `${workspacePath}:${[
          `${workspacePath}/src/app.ts`,
          `${workspacePath}/src/new.ts`,
        ].sort().join(":")}`,
        changedFilesMetrics,
      ],
    ]);

    const calculator = new ImpactCalculator(
      createMockSccService(fullRuns, fileRuns),
      createMockJscpdService(),
      os,
    );

    const fullResult = await calculator.calculateImpact(
      "session-1",
      upstreamPath,
      workspacePath,
      true,
    );

    const incrementalResult = await calculator.calculateImpact(
      "session-1",
      upstreamPath,
      workspacePath,
      false,
    );

    expect(incrementalResult.metrics.files.new).toBe(fullResult.metrics.files.new);
    expect(incrementalResult.metrics.files.changed).toBe(
      fullResult.metrics.files.changed,
    );
    expect(incrementalResult.metrics.files.deleted).toBe(
      fullResult.metrics.files.deleted,
    );
    expect(incrementalResult.metrics.absoluteComplexity.workspace).toBe(
      fullResult.metrics.absoluteComplexity.workspace,
    );
    expect(incrementalResult.metrics.absoluteLoc.total.workspace).toBe(
      fullResult.metrics.absoluteLoc.total.workspace,
    );
  });

  it("falls back to full scan when no baseline exists", async () => {
    const upstreamMetrics = createSccMetrics([
      createSccFileMetrics("src/app.ts", "TypeScript", 3, 3, 2),
    ]);

    const workspaceMetrics = createSccMetrics([
      createSccFileMetrics("src/app.ts", "TypeScript", 3, 3, 2),
    ]);

    const fullRuns = new Map([
      [upstreamPath, upstreamMetrics],
      [workspacePath, workspaceMetrics],
    ]);
    const fileRuns = new Map<string, SccMetrics>();

    const calculator = new ImpactCalculator(
      createMockSccService(fullRuns, fileRuns),
      createMockJscpdService(),
      os,
    );

    const result = await calculator.calculateImpact(
      "session-1",
      upstreamPath,
      workspacePath,
      false,
    );

    expect(result.metrics.files.changed).toBe(1);
    expect(result.metrics.files.new).toBe(1);
    expect(result.metrics.files.deleted).toBe(1);
  });
});
