import type { OS } from "../os/types.js";
import { logger } from "../logger.js";

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
  private os: OS;

  constructor(os: OS, customPath?: string) {
    this.os = os;
    if (customPath) {
      this.jscpdPath = customPath;
    } else {
      this.jscpdPath = os.path.join(process.cwd(), "node_modules/.bin/jscpd");
    }
  }

  getJscpdPath(): string {
    return this.jscpdPath;
  }

  isInstalled(): boolean {
    return this.os.fs.exists(this.jscpdPath);
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

    const outputDir = this.os.path.join(
      this.os.path.tempDir(),
      `jscpd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    this.os.fs.mkdir(outputDir, { recursive: true });

    try {
      const report = await this.runJscpd(filePaths, outputDir);
      return this.parseJscpdOutput(report);
    } finally {
      try {
        this.os.fs.rm(outputDir, { recursive: true, force: true });
      } catch {}
    }
  }

  private async runJscpd(
    filePaths: string[],
    outputDir: string,
  ): Promise<JscpdReport> {
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

    const child = this.os.command.spawn([this.jscpdPath, ...args], { timeoutMs: 30000 });

    let stderr = "";
    const stderrReader = child.stderr.getReader();
    try {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        stderr += new TextDecoder().decode(value);
      }
    } finally {
      stderrReader.releaseLock();
    }

    const exitCode = await child.exited;

    if (exitCode !== 0 && exitCode !== 1) {
      // jscpd exits with 1 when duplicates are found — that's not an error
      throw new Error(`jscpd exited with code ${exitCode}: ${stderr}`);
    }

    const reportPath = this.os.path.join(outputDir, "jscpd-report.json");
    if (!this.os.fs.exists(reportPath)) {
      return {
        duplicates: [],
        statistics: {
          total: { duplicatedLines: 0, duplicatedTokens: 0, percentage: 0 },
        },
      };
    }

    try {
      const reportContent = this.os.fs.readFile(reportPath, "utf-8");
      const report: JscpdReport = JSON.parse(reportContent);
      return report;
    } catch (err) {
      throw new Error(`Failed to parse jscpd report: ${err}`);
    }
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
      { path: this.os.path.join(directory, ".gitignore"), label: ".gitignore" },
      { path: this.os.path.join(directory, ".mimoignore"), label: ".mimoignore" },
    ];

    const lines: string[] = [
      "# Generated by MIMO - composite ignore for jscpd",
      "",
    ];

    for (const source of sources) {
      if (this.os.fs.exists(source.path)) {
        lines.push(`# --- From: ${source.label} ---`);
        lines.push(this.os.fs.readFile(source.path, "utf-8"));
        lines.push("");
      }
    }

    const ignorePath = this.os.path.join(directory, ".jscpdignore");
    this.os.fs.writeFile(ignorePath, lines.join("\n"), "utf-8");
    return ignorePath;
  }
}
