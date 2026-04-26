import type { SccService, SccMetrics, SccFileMetrics } from "./scc-service.js";
import type { JscpdService, Clone } from "./jscpd-service.js";
import type { OS } from "../os/types.js";
import { logger } from "../logger.js";
import { detectChangedFiles } from "../files/changed-files.js";
import { shouldIncludeImpactPath } from "../files/impact-file-policy.js";
import {
  buildDependencyGraph,
  compareDependencyGraphs,
  extractTargetDirectory,
  isExternalDependency,
  parseElixirImports,
  parsePythonImports,
  parseTypeScriptImports,
  type DependencyChanges,
  type DependencyEdgeInput,
  type DependencyParserLanguage,
} from "./dependency-parser.js";

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
  absoluteComplexity: {
    upstream: number;
    workspace: number;
  };
  byLanguage: LanguageImpact[];
  byFile: FileImpactDetail[];
  duplication?: DuplicationMetrics;
  dependencies?: DependencyChanges;
  validation?: ImpactValidation;
  runMetadata?: ImpactRunMetadata;
}

export interface ImpactValidation {
  status: "ok" | "warning";
  errors: string[];
}

export interface ImpactRunMetadata {
  runId: string;
  calculatedAt: string;
  sessionId: string;
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
  private os: OS | undefined;

  constructor(
    customSccService?: SccService,
    customJscpdService?: JscpdService,
    os?: OS,
  ) {
    this.customSccService = customSccService;
    this.customJscpdService = customJscpdService;
    this.os = os;
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
    } catch (error) {
      logger.error(`[impact] Failed to get upstream metrics:`, error);
    }

    try {
      workspaceMetrics = await sccService.runScc(
        agentWorkspacePath,
        forceRefresh,
      );
    } catch (error) {
      logger.error(`[impact] Failed to get workspace metrics:`, error);
    }

    // Detect changed files using shared logic
    const changedFilesResult = await detectChangedFiles(
      this.os!,
      upstreamPath,
      agentWorkspacePath,
      { fileFilter: shouldIncludeImpactPath },
    );

    // Calculate file counts
    const files = {
      new: 0,
      changed: 0,
      deleted: 0,
      unchanged: 0,
    };

    const byFile: FileImpactDetail[] = [];

    // Map shared result to impact format
    for (const fileChange of changedFilesResult.files) {
      if (fileChange.status === "added") {
        files.new++;
        byFile.push({
          path: fileChange.path,
          status: "new",
          size: fileChange.size,
        });
      } else if (fileChange.status === "modified") {
        files.changed++;
        byFile.push({
          path: fileChange.path,
          status: "changed",
          size: fileChange.size,
        });
      } else if (fileChange.status === "deleted") {
        files.deleted++;
        byFile.push({
          path: fileChange.path,
          status: "deleted",
          size: fileChange.size,
        });
      }
    }

    // Calculate unchanged count from scc metrics if available
    if (upstreamMetrics && workspaceMetrics) {
      const changedPaths = new Set(byFile.map((f) => f.path));
      const allPaths = new Set([
        ...upstreamMetrics.byFile.map((f) => f.path),
        ...workspaceMetrics.byFile.map((f) => f.path),
      ]);
      for (const path of allPaths) {
        if (!changedPaths.has(path)) {
          files.unchanged++;
        }
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
          const fileComplexityDelta =
            workspaceFile.complexity - upstreamFile.complexity;
          cyclomaticDelta += fileComplexityDelta;

          // Anomaly detection: single file delta > 500%
          if (upstreamFile.complexity > 0) {
            const percentChange =
              Math.abs(fileComplexityDelta) / upstreamFile.complexity;
            if (percentChange > 5) {
              logger.warn(
                `[impact:anomaly] detected: single_file_threshold path=${relPath} old=${upstreamFile.complexity} new=${workspaceFile.complexity} delta=${fileComplexityDelta}`,
              );
            }
          }
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

    // Anomaly detection: total delta > 1000 complexity points
    if (Math.abs(cyclomaticDelta) > 1000) {
      const upComplexity = upstreamMetrics?.complexity?.cyclomatic ?? 0;
      const wsComplexity = workspaceMetrics?.complexity?.cyclomatic ?? 0;
      logger.warn(
        `[impact:anomaly] detected: total_threshold delta=${cyclomaticDelta} (upstream=${upComplexity} workspace=${wsComplexity})`,
      );
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
      .map((f) => this.os!.path.join(agentWorkspacePath, f.path))
      .filter((p) => this.os!.fs.exists(p));

    const duplication = await this.calculateDuplication(
      changedFilePaths,
      agentWorkspacePath,
      linesAdded + linesRemoved,
    );

    const dependencies = this.calculateDependencyChanges(
      changedFilesResult.files,
      upstreamPath,
      agentWorkspacePath,
    );

    const upstreamComplexity = upstreamMetrics?.complexity?.cyclomatic ?? 0;
    const workspaceComplexity = workspaceMetrics?.complexity?.cyclomatic ?? 0;

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
      absoluteComplexity: {
        upstream: upstreamComplexity,
        workspace: workspaceComplexity,
      },
      byLanguage: Array.from(languageMap.values()),
      byFile: byFileWithDetails,
      duplication,
      dependencies,
      validation: { status: "ok", errors: [] },
      runMetadata: {
        runId: this.createRunId(),
        calculatedAt: new Date().toISOString(),
        sessionId,
      },
    };

    const validation = validateImpactMetrics(metrics);
    metrics.validation = validation;
    if (validation.status === "warning") {
      logger.warn(
        `[impact:validation] status=warning errors=${validation.errors.join("|")}`,
      );
    }

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

  private calculateDependencyChanges(
    changedFiles: { path: string; status: "added" | "modified" | "deleted" }[],
    upstreamPath: string,
    workspacePath: string,
  ): DependencyChanges | undefined {
    try {
      const upstreamEdges: DependencyEdgeInput[] = [];
      const workspaceEdges: DependencyEdgeInput[] = [];

      for (const changedFile of changedFiles) {
        const language = this.getDependencyLanguage(changedFile.path);
        if (!language) {
          continue;
        }

        if (
          changedFile.status === "added" ||
          changedFile.status === "modified"
        ) {
          const workspaceFilePath = this.os!.path.join(
            workspacePath,
            changedFile.path,
          );
          if (this.os!.fs.exists(workspaceFilePath)) {
            workspaceEdges.push(
              ...this.parseDependencyEdgesForFile(
                changedFile.path,
                this.os!.fs.readFile(workspaceFilePath, "utf8"),
                language,
              ),
            );
          }
        }

        if (
          changedFile.status === "deleted" ||
          changedFile.status === "modified"
        ) {
          const upstreamFilePath = this.os!.path.join(
            upstreamPath,
            changedFile.path,
          );
          if (this.os!.fs.exists(upstreamFilePath)) {
            upstreamEdges.push(
              ...this.parseDependencyEdgesForFile(
                changedFile.path,
                this.os!.fs.readFile(upstreamFilePath, "utf8"),
                language,
              ),
            );
          }
        }
      }

      const upstreamGraph = buildDependencyGraph(upstreamEdges);
      const workspaceGraph = buildDependencyGraph(workspaceEdges);
      return compareDependencyGraphs(upstreamGraph, workspaceGraph);
    } catch (error) {
      logger.error("[impact] Failed to calculate dependency changes:", error);
      return undefined;
    }
  }

  private getDependencyLanguage(
    filePath: string,
  ): DependencyParserLanguage | undefined {
    const extension = this.os!.path.extname(filePath).toLowerCase();
    if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
      return "typescript";
    }
    if (extension === ".py") {
      return "python";
    }
    if (extension === ".ex" || extension === ".exs") {
      return "elixir";
    }
    return undefined;
  }

  private parseDependencyEdgesForFile(
    filePath: string,
    content: string,
    language: DependencyParserLanguage,
  ): DependencyEdgeInput[] {
    const sourceDirectory =
      this.os!.path.dirname(filePath).replace(/\\/g, "/") || ".";
    let parsedDependencies: string[] = [];

    if (language === "typescript") {
      parsedDependencies = parseTypeScriptImports(content);
    } else if (language === "python") {
      parsedDependencies = parsePythonImports(content);
    } else {
      parsedDependencies = parseElixirImports(content);
    }

    const edges: DependencyEdgeInput[] = [];
    for (const dependencyPath of parsedDependencies) {
      if (isExternalDependency(dependencyPath, language)) {
        continue;
      }
      const target = extractTargetDirectory(
        filePath,
        dependencyPath,
        language,
        this.os,
      );
      if (!target || target === sourceDirectory) {
        continue;
      }
      edges.push({ source: sourceDirectory, target, file: filePath });
    }
    return edges;
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

    const cyclomaticTrend = getTrend(
      current.complexity.cyclomatic,
      previous.complexity.cyclomatic,
    );

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
        cyclomatic: cyclomaticTrend,
        cognitive: getTrend(
          current.complexity.cognitive,
          previous.complexity.cognitive,
        ),
      },
    };
  }

  private createRunId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

export function validateImpactMetrics(metrics: ImpactMetrics): ImpactValidation {
  const errors: string[] = [];

  const expectedCyclomaticDelta =
    metrics.absoluteComplexity.workspace - metrics.absoluteComplexity.upstream;
  if (metrics.complexity.cyclomatic !== expectedCyclomaticDelta) {
    errors.push(
      `complexity_delta_mismatch expected=${expectedCyclomaticDelta} actual=${metrics.complexity.cyclomatic}`,
    );
  }

  const expectedNet = metrics.linesOfCode.added - metrics.linesOfCode.removed;
  if (metrics.linesOfCode.net !== expectedNet) {
    errors.push(
      `loc_net_mismatch expected=${expectedNet} actual=${metrics.linesOfCode.net}`,
    );
  }

  if (errors.length > 0) {
    return { status: "warning", errors };
  }

  return { status: "ok", errors: [] };
}
