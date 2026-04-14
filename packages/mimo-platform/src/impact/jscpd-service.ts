import { join, relative } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { spawn } from "child_process";
import { tmpdir } from "os";

export interface Clone {
  firstFile: { path: string; startLine: number; endLine: number };
  secondFile: { path: string; startLine: number; endLine: number };
  lines: number;
  tokens: number;
  fragment: string;
  type: "cross" | "intra";
}

export interface JscpdMetrics {
  duplicatedLines: number;
  duplicatedTokens: number;
  percentage: number;
  clones: Clone[];
}

// jscpd JSON report format
interface JscpdDuplicate {
  format: string;
  lines: number;
  tokens: number;
  fragment: string;
  firstFile: { name: string; start: number; end: number };
  secondFile: { name: string; start: number; end: number };
}

interface JscpdReport {
  duplicates: JscpdDuplicate[];
  statistics: {
    total: {
      duplicatedLines: number;
      duplicatedTokens: number;
      percentage: number;
    };
  };
}

export class JscpdService {
  private jscpdPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.jscpdPath = customPath;
    } else {
      this.jscpdPath = join(process.cwd(), "node_modules/.bin/jscpd");
    }
  }

  getJscpdPath(): string {
    return this.jscpdPath;
  }

  isInstalled(): boolean {
    return existsSync(this.jscpdPath);
  }

  async install(): Promise<{ success: boolean; error?: string }> {
    // jscpd is a package dependency — always available after bun install
    if (this.isInstalled()) {
      return { success: true };
    }
    return {
      success: false,
      error: `jscpd binary not found at ${this.jscpdPath}. Run bun install.`,
    };
  }

  async runOnFiles(
    filePaths: string[],
    directory: string,
  ): Promise<JscpdMetrics> {
    if (!this.isInstalled()) {
      throw new Error(`jscpd not installed at ${this.jscpdPath}`);
    }

    if (filePaths.length === 0) {
      return {
        duplicatedLines: 0,
        duplicatedTokens: 0,
        percentage: 0,
        clones: [],
      };
    }

    // Build composite ignore file
    await this.buildIgnoreFile(directory);

    const outputDir = join(
      tmpdir(),
      `jscpd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(outputDir, { recursive: true });

    try {
      const report = await this.runJscpd(filePaths, outputDir);
      return this.parseJscpdOutput(report);
    } finally {
      try {
        rmSync(outputDir, { recursive: true, force: true });
      } catch {}
    }
  }

  private runJscpd(
    filePaths: string[],
    outputDir: string,
  ): Promise<JscpdReport> {
    return new Promise((resolve, reject) => {
      const args = [
        "--reporters",
        "json",
        "--output",
        outputDir,
        "--min-lines",
        "3",
        "--min-tokens",
        "30",
        ...filePaths,
      ];

      const child = spawn(this.jscpdPath, args, { timeout: 30000 });

      let stderr = "";
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code !== 0 && code !== 1) {
          // jscpd exits with 1 when duplicates are found — that's not an error
          reject(new Error(`jscpd exited with code ${code}: ${stderr}`));
          return;
        }

        const reportPath = join(outputDir, "jscpd-report.json");
        if (!existsSync(reportPath)) {
          resolve({
            duplicates: [],
            statistics: {
              total: { duplicatedLines: 0, duplicatedTokens: 0, percentage: 0 },
            },
          });
          return;
        }

        try {
          const report: JscpdReport = JSON.parse(
            readFileSync(reportPath, "utf-8"),
          );
          resolve(report);
        } catch (err) {
          reject(new Error(`Failed to parse jscpd report: ${err}`));
        }
      });

      child.on("error", (err) =>
        reject(new Error(`Failed to run jscpd: ${err.message}`)),
      );
    });
  }

  parseJscpdOutput(report: JscpdReport): JscpdMetrics {
    const clones: Clone[] = (report.duplicates || []).map((dup) => {
      const isSameFile = dup.firstFile.name === dup.secondFile.name;
      return {
        firstFile: {
          path: dup.firstFile.name,
          startLine: dup.firstFile.start,
          endLine: dup.firstFile.end,
        },
        secondFile: {
          path: dup.secondFile.name,
          startLine: dup.secondFile.start,
          endLine: dup.secondFile.end,
        },
        lines: dup.lines,
        tokens: dup.tokens || 0,
        fragment: dup.fragment || "",
        type: isSameFile ? "intra" : "cross",
      };
    });

    const stats = report.statistics?.total || {
      duplicatedLines: 0,
      duplicatedTokens: 0,
      percentage: 0,
    };

    return {
      duplicatedLines: stats.duplicatedLines || 0,
      duplicatedTokens: stats.duplicatedTokens || 0,
      percentage: stats.percentage || 0,
      clones,
    };
  }

  async buildIgnoreFile(directory: string): Promise<string> {
    const sources = [
      { path: join(directory, ".gitignore"), label: ".gitignore" },
      { path: join(directory, ".mimoignore"), label: ".mimoignore" },
    ];

    const lines: string[] = [
      "# Generated by MIMO - composite ignore for jscpd",
      "",
    ];

    for (const source of sources) {
      if (existsSync(source.path)) {
        lines.push(`# --- From: ${source.label} ---`);
        lines.push(readFileSync(source.path, "utf-8"));
        lines.push("");
      }
    }

    const ignorePath = join(directory, ".jscpdignore");
    writeFileSync(ignorePath, lines.join("\n"), "utf-8");
    return ignorePath;
  }
}

let _jscpdService: JscpdService | undefined;

export function getJscpdService(): JscpdService {
  if (!_jscpdService) {
    _jscpdService = new JscpdService();
  }
  return _jscpdService;
}
