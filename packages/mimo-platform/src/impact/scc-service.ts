import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { execSync, spawn } from "child_process";
import { homedir } from "os";
import { getMimoHome } from "../config/global-config.js";
import { getPaths } from "../config/paths.js";

export interface SccPlatform {
  os: "Linux" | "Darwin" | "Windows";
  arch: "x86_64" | "arm64";
}

export interface SccMetrics {
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
  byLanguage: SccLanguageMetrics[];
  byFile: SccFileMetrics[];
}

export interface SccLanguageMetrics {
  language: string;
  files: number;
  lines: number;
  code: number;
  comment: number;
  blank: number;
  complexity: number;
}

export interface SccFileMetrics {
  path: string;
  language: string;
  lines: number;
  code: number;
  comment: number;
  blank: number;
  complexity: number;
}

interface SccJsonOutput {
  files: Array<{
    filename: string;
    language: string;
    lines: number;
    code: number;
    comment: number;
    blank: number;
    complexity: number;
  }>;
}

export class SccService {
  private sccPath: string;
  private cache: Map<string, { data: SccMetrics; timestamp: number }> = new Map();
  private cacheTTL = 5000; // 5 seconds

  constructor(customPath?: string) {
    if (customPath) {
      this.sccPath = customPath;
    } else {
      // Check global config first (for tests)
      const globalHome = getMimoHome();
      if (globalHome) {
        this.sccPath = join(globalHome, "bin", "scc");
      } else {
        // Fall back to paths module
        const paths = getPaths();
        this.sccPath = join(paths.root, "bin", "scc");
      }
    }
  }

  getSccPath(): string {
    return this.sccPath;
  }

  isInstalled(): boolean {
    return existsSync(this.sccPath);
  }

  detectPlatform(): SccPlatform {
    const platform = process.platform;
    const arch = process.arch;

    let os: SccPlatform["os"];
    switch (platform) {
      case "linux":
        os = "Linux";
        break;
      case "darwin":
        os = "Darwin";
        break;
      case "win32":
        os = "Windows";
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    let mappedArch: SccPlatform["arch"];
    if (arch === "x64") {
      mappedArch = "x86_64";
    } else if (arch === "arm64") {
      mappedArch = "arm64";
    } else {
      throw new Error(`Unsupported architecture: ${arch}`);
    }

    return { os, arch: mappedArch };
  }

  getDownloadUrl(platform: SccPlatform): string {
    const version = "3.5.0";
    const ext = platform.os === "Windows" ? ".zip" : ".tar.gz";
    return `https://github.com/boyter/scc/releases/download/v${version}/scc_${platform.os}_${platform.arch}${ext}`;
  }

  async install(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.isInstalled()) {
        return { success: true };
      }

      const platform = this.detectPlatform();
      const url = this.getDownloadUrl(platform);
      
      // Check global config first (for tests), then fall back to getPaths
      const globalHome = getMimoHome();
      const binDir = globalHome 
        ? join(globalHome, "bin")
        : join(getPaths().root, "bin");

      // Create bin directory if needed
      if (!existsSync(binDir)) {
        mkdirSync(binDir, { recursive: true });
      }

      // Download and extract scc
      const ext = platform.os === "Windows" ? ".zip" : ".tar.gz";
      const downloadPath = join(binDir, `scc${ext}`);

      console.log(`[scc] Downloading from ${url}...`);
      
      // Download using curl
      execSync(`curl -L -o "${downloadPath}" "${url}"`, {
        timeout: 120000,
      });

      console.log("[scc] Extracting...");

      // Extract
      if (platform.os === "Windows") {
        execSync(`powershell -command "Expand-Archive -Path '${downloadPath}' -DestinationPath '${binDir}' -Force"`);
      } else {
        execSync(`tar -xzf "${downloadPath}" -C "${binDir}"`);
      }

      // Make executable
      chmodSync(this.sccPath, 0o755);

      // Clean up archive
      execSync(`rm "${downloadPath}"`);

      console.log(`[scc] Installed to ${this.sccPath}`);
      return { success: true };
    } catch (error) {
      console.error("[scc] Installation failed:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  async runScc(directory: string): Promise<SccMetrics> {
    // Check cache first
    const cacheKey = directory;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    if (!this.isInstalled()) {
      throw new Error("scc is not installed. Run install() first.");
    }

    return new Promise((resolve, reject) => {
      const args = ["--by-file", "-f", "json", directory];
      const child = spawn(this.sccPath, args, {
        timeout: 30000, // 30 second timeout
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`scc exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const output: SccJsonOutput = JSON.parse(stdout);
          const metrics = this.parseSccOutput(output);
          
          // Cache the result
          this.cache.set(cacheKey, { data: metrics, timestamp: Date.now() });
          
          resolve(metrics);
        } catch (error) {
          reject(new Error(`Failed to parse scc output: ${error}`));
        }
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to run scc: ${error.message}`));
      });
    });
  }

  private parseSccOutput(output: SccJsonOutput): SccMetrics {
    const files = output.files || [];
    
    // Calculate totals
    let totalLines = 0;
    let totalCode = 0;
    let totalComplexity = 0;
    
    const languageMap = new Map<string, SccLanguageMetrics>();
    const fileMetrics: SccFileMetrics[] = [];

    for (const file of files) {
      totalLines += file.lines;
      totalCode += file.code;
      totalComplexity += file.complexity || 0;

      // Language aggregation
      const lang = file.language || "Unknown";
      const existing = languageMap.get(lang);
      if (existing) {
        existing.files++;
        existing.lines += file.lines;
        existing.code += file.code;
        existing.comment += file.comment;
        existing.blank += file.blank;
        existing.complexity += file.complexity || 0;
      } else {
        languageMap.set(lang, {
          language: lang,
          files: 1,
          lines: file.lines,
          code: file.code,
          comment: file.comment,
          blank: file.blank,
          complexity: file.complexity || 0,
        });
      }

      fileMetrics.push({
        path: file.filename,
        language: lang,
        lines: file.lines,
        code: file.code,
        comment: file.comment,
        blank: file.blank,
        complexity: file.complexity || 0,
      });
    }

    return {
      linesOfCode: {
        added: totalCode, // Will be calculated as delta by ImpactCalculator
        removed: 0,
        net: totalCode,
      },
      complexity: {
        cyclomatic: totalComplexity,
        cognitive: 0, // scc doesn't provide cognitive complexity
        estimatedMinutes: Math.ceil(totalCode / 10), // Rough estimate: 10 lines per minute
      },
      byLanguage: Array.from(languageMap.values()),
      byFile: fileMetrics,
    };
  }

  clearCache(directory?: string): void {
    if (directory) {
      this.cache.delete(directory);
    } else {
      this.cache.clear();
    }
  }
}

let _sccService: SccService | undefined;

export function getSccService(): SccService {
  if (!_sccService) {
    _sccService = new SccService();
  }
  return _sccService;
}

export const sccService = getSccService();
