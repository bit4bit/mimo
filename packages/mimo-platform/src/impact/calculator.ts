import { join, relative, dirname } from "path";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import crypto from "crypto";
import type { SccService, SccMetrics, SccFileMetrics } from "./scc-service.js";
import type { JscpdService, Clone } from "./jscpd-service.js";
import { logger } from "../logger.js";

export type FileStatus = "new" | "changed" | "deleted" | "unchanged";

export interface FileImpact {
  path: string;
  status: FileStatus;
  size?: number;
  checksum?: string;
}

export interface DuplicationMetrics {
  duplicatedLines: number;
  duplicatedTokens: number;
  percentage: number;
  clones: Clone[];
  byFile: Record<string, Clone[]>;
}

export interface ImpactMetrics {
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
    estimatedMinutes: number;
  };
  byLanguage: LanguageImpact[];
  byFile: FileImpactDetail[];
  duplication?: DuplicationMetrics;
}

export interface LanguageImpact {
  language: string;
  files: number;
  linesAdded: number;
  linesRemoved: number;
  complexityDelta: number;
}

export interface FileImpactDetail extends FileImpact {
  language?: string;
  lines?: number;
  complexity?: number;
}

export interface ImpactTrend {
  files: { new: string; changed: string; deleted: string };
  linesOfCode: { added: string; removed: string; net: string };
  complexity: { cyclomatic: string; cognitive: string };
}

interface PreviousState {
  fileCounts: { new: number; changed: number; deleted: number };
  loc: { added: number; removed: number; net: number };
  complexity: { cyclomatic: number; cognitive: number };
  timestamp: number;
}

export class ImpactCalculator {
  private previousStates: Map<string, PreviousState> = new Map();
  private customSccService: SccService | undefined;
  private customJscpdService: JscpdService | undefined;

  constructor(
    customSccService?: SccService,
    customJscpdService?: JscpdService,
  ) {
    this.customSccService = customSccService;
    this.customJscpdService = customJscpdService;
  }

  private async getSccService(): Promise<SccService> {
    if (this.customSccService) {
      return this.customSccService;
    }
    throw new Error(
      "SccService must be provided via mimoContext - use createMimoContext()",
    );
  }

  private async getJscpdService(): Promise<JscpdService> {
    if (this.customJscpdService) {
      return this.customJscpdService;
    }
    throw new Error(
      "JscpdService must be provided via mimoContext - use createMimoContext()",
    );
  }

  async calculateImpact(
    sessionId: string,
    upstreamPath: string,
    agentWorkspacePath: string,
    forceRefresh = false,
  ): Promise<{ metrics: ImpactMetrics; trends: ImpactTrend }> {
    const sccService = await this.getSccService();

    // Ensure scc is installed
    if (!sccService.isInstalled()) {
      await sccService.install();
    }

    // Get scc metrics for both directories
    let upstreamMetrics: ReturnType<typeof sccService.runScc> extends Promise<
      infer T
    >
      ? T
      : never | null = null;
    let workspaceMetrics: ReturnType<typeof sccService.runScc> extends Promise<
      infer T
    >
      ? T
      : never | null = null;

    try {
      upstreamMetrics = await sccService.runScc(upstreamPath, forceRefresh);
      logger.debug(`[impact] Upstream scc metrics:`, upstreamMetrics);
    } catch (error) {
      logger.error(`[impact] Failed to get upstream metrics:`, error);
    }

    try {
      workspaceMetrics = await sccService.runScc(
        agentWorkspacePath,
        forceRefresh,
      );
      logger.debug(`[impact] Workspace scc metrics:`, workspaceMetrics);
    } catch (error) {
      logger.error(`[impact] Failed to get workspace metrics:`, error);
    }

    // Calculate file changes by scanning directories
    const fileChanges = await this.calculateFileChanges(
      upstreamPath,
      agentWorkspacePath,
    );

    // Build file map for quick lookup
    const upstreamFiles = new Map<string, { checksum: string; size: number }>();
    const workspaceFiles = new Map<
      string,
      { checksum: string; size: number }
    >();

    await this.scanDirectory(upstreamPath, upstreamPath, upstreamFiles);
    await this.scanDirectory(
      agentWorkspacePath,
      agentWorkspacePath,
      workspaceFiles,
    );

    // Calculate file counts
    const files = {
      new: 0,
      changed: 0,
      deleted: 0,
      unchanged: 0,
    };

    const byFile: FileImpactDetail[] = [];

    // Check workspace files
    for (const [relPath, workspaceInfo] of workspaceFiles) {
      const upstreamInfo = upstreamFiles.get(relPath);

      if (!upstreamInfo) {
        files.new++;
        byFile.push({
          path: relPath,
          status: "new",
          size: workspaceInfo.size,
          checksum: workspaceInfo.checksum,
        });
      } else if (upstreamInfo.checksum !== workspaceInfo.checksum) {
        files.changed++;
        byFile.push({
          path: relPath,
          status: "changed",
          size: workspaceInfo.size,
          checksum: workspaceInfo.checksum,
        });
      } else {
        files.unchanged++;
      }
    }

    // Check for deleted files
    for (const [relPath, upstreamInfo] of upstreamFiles) {
      if (!workspaceFiles.has(relPath)) {
        files.deleted++;
        byFile.push({
          path: relPath,
          status: "deleted",
          size: upstreamInfo.size,
          checksum: upstreamInfo.checksum,
        });
      }
    }

    // Calculate LOC and complexity deltas
    let linesAdded = 0;
    let linesRemoved = 0;
    let cyclomaticDelta = 0;
    let cognitiveDelta = 0;
    let estimatedMinutes = 0;

    const languageMap = new Map<string, LanguageImpact>();

    if (upstreamMetrics && workspaceMetrics) {
      // Create file lookup maps
      const upstreamFilesByPath = new Map(
        upstreamMetrics.byFile.map((f) => [f.path, f]),
      );
      const workspaceFilesByPath = new Map(
        workspaceMetrics.byFile.map((f) => [f.path, f]),
      );

      // Calculate deltas
      for (const [relPath, workspaceFile] of workspaceFilesByPath) {
        const upstreamFile = upstreamFilesByPath.get(relPath);

        if (!upstreamFile) {
          // New file - add all its metrics
          linesAdded += workspaceFile.code;
          cyclomaticDelta += workspaceFile.complexity;
          estimatedMinutes += workspaceFile.code / 10;
        } else {
          // Changed file - calculate delta
          const locDelta = workspaceFile.code - upstreamFile.code;
          if (locDelta > 0) {
            linesAdded += locDelta;
          } else {
            linesRemoved += Math.abs(locDelta);
          }
          cyclomaticDelta += workspaceFile.complexity - upstreamFile.complexity;
        }

        // Language aggregation
        const lang = workspaceFile.language;
        const existing = languageMap.get(lang);
        if (existing) {
          existing.files++;
          if (!upstreamFile) {
            existing.linesAdded += workspaceFile.code;
          } else {
            const delta = workspaceFile.code - upstreamFile.code;
            if (delta > 0) existing.linesAdded += delta;
            else existing.linesRemoved += Math.abs(delta);
          }
          existing.complexityDelta +=
            workspaceFile.complexity - (upstreamFile?.complexity || 0);
        } else {
          const linesAdded = upstreamFile
            ? Math.max(0, workspaceFile.code - upstreamFile.code)
            : workspaceFile.code;
          const linesRemoved = upstreamFile
            ? Math.max(0, upstreamFile.code - workspaceFile.code)
            : 0;
          languageMap.set(lang, {
            language: lang,
            files: 1,
            linesAdded,
            linesRemoved,
            complexityDelta:
              workspaceFile.complexity - (upstreamFile?.complexity || 0),
          });
        }
      }

      // Handle deleted files
      for (const [relPath, upstreamFile] of upstreamFilesByPath) {
        if (!workspaceFilesByPath.has(relPath)) {
          linesRemoved += upstreamFile.code;
          cyclomaticDelta -= upstreamFile.complexity;

          const lang = upstreamFile.language;
          const existing = languageMap.get(lang);
          if (existing) {
            existing.files++;
            existing.linesRemoved += upstreamFile.code;
            existing.complexityDelta -= upstreamFile.complexity;
          } else {
            languageMap.set(lang, {
              language: lang,
              files: 1,
              linesAdded: 0,
              linesRemoved: upstreamFile.code,
              complexityDelta: -upstreamFile.complexity,
            });
          }
        }
      }
    }

    // Add scc metrics for files
    const byFileWithDetails: FileImpactDetail[] = byFile.map((f) => {
      // Find matching scc data if available
      const sccFile =
        workspaceMetrics?.byFile.find((sf) => sf.path === f.path) ||
        upstreamMetrics?.byFile.find((sf) => sf.path === f.path);

      if (sccFile) {
        return {
          ...f,
          language: sccFile.language,
          lines: sccFile.code,
          complexity: sccFile.complexity,
        };
      }
      return f;
    });

    // Calculate duplication for changed files
    const changedFilePaths = byFile
      .filter((f) => f.status === "new" || f.status === "changed")
      .map((f) => join(agentWorkspacePath, f.path))
      .filter((p) => existsSync(p));

    const duplication = await this.calculateDuplication(
      changedFilePaths,
      agentWorkspacePath,
      linesAdded + linesRemoved,
    );

    const metrics: ImpactMetrics = {
      files,
      linesOfCode: {
        added: linesAdded,
        removed: linesRemoved,
        net: linesAdded - linesRemoved,
      },
      complexity: {
        cyclomatic: cyclomaticDelta,
        cognitive: cognitiveDelta,
        estimatedMinutes: Math.max(0, Math.ceil(estimatedMinutes)),
      },
      byLanguage: Array.from(languageMap.values()),
      byFile: byFileWithDetails,
      duplication,
    };

    // Calculate trends
    const trends = this.calculateTrends(sessionId, metrics);

    // Store current state for next trend calculation
    this.previousStates.set(sessionId, {
      fileCounts: {
        new: files.new,
        changed: files.changed,
        deleted: files.deleted,
      },
      loc: {
        added: linesAdded,
        removed: linesRemoved,
        net: linesAdded - linesRemoved,
      },
      complexity: { cyclomatic: cyclomaticDelta, cognitive: cognitiveDelta },
      timestamp: Date.now(),
    });

    return { metrics, trends };
  }

  private async calculateDuplication(
    changedFilePaths: string[],
    workspacePath: string,
    totalChangedLines: number,
  ): Promise<DuplicationMetrics> {
    if (changedFilePaths.length === 0) {
      return {
        duplicatedLines: 0,
        duplicatedTokens: 0,
        percentage: 0,
        clones: [],
        byFile: {},
      };
    }

    try {
      const jscpdService = await this.getJscpdService();
      if (!jscpdService.isInstalled()) {
        return {
          duplicatedLines: 0,
          duplicatedTokens: 0,
          percentage: 0,
          clones: [],
          byFile: {},
        };
      }

      const jscpdMetrics = await jscpdService.runOnFiles(
        changedFilePaths,
        workspacePath,
      );

      // Group clones by file
      const byFile: Record<string, Clone[]> = {};
      for (const clone of jscpdMetrics.clones) {
        for (const filePath of [clone.firstFile.path, clone.secondFile.path]) {
          if (!byFile[filePath]) {
            byFile[filePath] = [];
          }
          if (!byFile[filePath].includes(clone)) {
            byFile[filePath].push(clone);
          }
        }
      }

      const percentage =
        totalChangedLines > 0
          ? (jscpdMetrics.duplicatedLines / totalChangedLines) * 100
          : jscpdMetrics.percentage;

      return {
        duplicatedLines: jscpdMetrics.duplicatedLines,
        duplicatedTokens: jscpdMetrics.duplicatedTokens,
        percentage: Math.min(100, percentage),
        clones: jscpdMetrics.clones,
        byFile,
      };
    } catch (error) {
      logger.error("[impact] Failed to calculate duplication:", error);
      return {
        duplicatedLines: 0,
        duplicatedTokens: 0,
        percentage: 0,
        clones: [],
        byFile: {},
      };
    }
  }

  private async calculateFileChanges(
    upstreamPath: string,
    agentWorkspacePath: string,
  ): Promise<FileImpact[]> {
    const changes: FileImpact[] = [];

    // This is a simplified version - the main logic is in the calculateImpact method
    return changes;
  }

  private async scanDirectory(
    dirPath: string,
    basePath: string,
    fileMap: Map<string, { checksum: string; size: number }>,
  ): Promise<void> {
    if (!existsSync(dirPath)) return;

    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = relative(basePath, fullPath);

      // Skip hidden files and directories
      if (entry.name.startsWith(".")) continue;

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, basePath, fileMap);
      } else {
        const stats = statSync(fullPath);
        const content = readFileSync(fullPath);
        const checksum = crypto.createHash("md5").update(content).digest("hex");

        fileMap.set(relativePath, { checksum, size: stats.size });
      }
    }
  }

  private calculateTrends(
    sessionId: string,
    current: ImpactMetrics,
  ): ImpactTrend {
    const previous = this.previousStates.get(sessionId);

    if (!previous) {
      // No previous state - all trends are stable
      return {
        files: { new: "→", changed: "→", deleted: "→" },
        linesOfCode: { added: "→", removed: "→", net: "→" },
        complexity: { cyclomatic: "→", cognitive: "→" },
      };
    }

    const getTrend = (current: number, previous: number): string => {
      if (current > previous) return "↑";
      if (current < previous) return "↓";
      return "→";
    };

    return {
      files: {
        new: getTrend(current.files.new, previous.fileCounts.new),
        changed: getTrend(current.files.changed, previous.fileCounts.changed),
        deleted: getTrend(current.files.deleted, previous.fileCounts.deleted),
      },
      linesOfCode: {
        added: getTrend(current.linesOfCode.added, previous.loc.added),
        removed: getTrend(current.linesOfCode.removed, previous.loc.removed),
        net: getTrend(current.linesOfCode.net, previous.loc.net),
      },
      complexity: {
        cyclomatic: getTrend(
          current.complexity.cyclomatic,
          previous.complexity.cyclomatic,
        ),
        cognitive: getTrend(
          current.complexity.cognitive,
          previous.complexity.cognitive,
        ),
      },
    };
  }

  clearState(sessionId?: string): void {
    if (sessionId) {
      this.previousStates.delete(sessionId);
    } else {
      this.previousStates.clear();
    }
  }
}

let _impactCalculator: ImpactCalculator | undefined;

export function getImpactCalculator(): ImpactCalculator {
  if (!_impactCalculator) {
    _impactCalculator = new ImpactCalculator();
  }
  return _impactCalculator;
}

export const impactCalculator = getImpactCalculator();
