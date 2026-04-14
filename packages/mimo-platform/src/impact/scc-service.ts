import { join, dirname } from "path";
import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync, renameSync, unlinkSync } from "fs";
import { execSync, spawn } from "child_process";
import { logger } from "../logger.js";

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

// SCC JSON output format: array of language groups, each containing files
interface SccLanguageGroup {
  Name: string;
  Bytes: number;
  CodeBytes: number;
  Lines: number;
  Code: number;
  Comment: number;
  Blank: number;
  Complexity: number;
  Count: number;
  WeightedComplexity: number;
  Files: Array<{
    Language: string;
    PossibleLanguages: string[];
    Filename: string;
    Extension: string;
    Location: string;
    Symlocation: string;
    Bytes: number;
    Lines: number;
    Code: number;
    Comment: number;
    Blank: number;
    Complexity: number;
    WeightedComplexity: number;
    Hash: string | null;
    Binary: boolean;
    Minified: boolean;
    Generated: boolean;
    EndPoint: number;
    Uloc: number;
  }>;
  LineLength: null;
  ULOC: number;
}

type SccJsonOutput = SccLanguageGroup[];

// Cache structures for smart caching
interface SccCacheEntry {
  valid: boolean;
  data: SccMetrics | null;
  cachedAt: number;
}

interface SccCacheData {
  entries: Record<string, SccCacheEntry>;
}

export class SccService {
  private sccPath: string;
  private smartCache: Map<string, SccCacheEntry> = new Map();
  private staleDirectories: Set<string> = new Set();
  private cacheFilePath: string;
  private customCacheDir?: string;

  constructor(customPath: string, customCacheDir?: string) {
    this.sccPath = customPath;
    this.customCacheDir = customCacheDir;
    
    // Initialize cache file path
    if (customCacheDir) {
      this.cacheFilePath = join(customCacheDir, "scc-cache.json");
    } else {
      // Fallback - caller should always provide cacheDir via configure()
      this.cacheFilePath = join(".mimo", "cache", "scc-cache.json");
    }
    
    // Load existing cache on initialization (optional)
    try {
      this.loadCache();
    } catch {
      // Ignore errors during initialization
    }
  }

  configure(config: { mimoHome: string; cacheDir?: string }): void {
    this.sccPath = join(config.mimoHome, "bin", "scc");
    if (!this.customCacheDir && config.cacheDir) {
      this.cacheFilePath = join(config.cacheDir, "scc-cache.json");
    } else if (!this.customCacheDir) {
      this.cacheFilePath = join(config.mimoHome, ".mimo", "cache", "scc-cache.json");
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
      // Get bin directory from configured sccPath
      const binDir = dirname(this.sccPath);

      if (this.isInstalled()) {
        return { success: true };
      }

      const platform = this.detectPlatform();
      const url = this.getDownloadUrl(platform);

      // Create bin directory if needed
      if (!existsSync(binDir)) {
        mkdirSync(binDir, { recursive: true });
      }

      // Download and extract scc
      const ext = platform.os === "Windows" ? ".zip" : ".tar.gz";
      const downloadPath = join(binDir, `scc${ext}`);

      logger.debug(`[scc] Downloading from ${url}...`);
      
      // Download using curl
      execSync(`curl -L -o "${downloadPath}" "${url}"`, {
        timeout: 120000,
      });

      logger.debug("[scc] Extracting...");

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

      logger.debug(`[scc] Installed to ${this.sccPath}`);
      return { success: true };
    } catch (error) {
      logger.error("[scc] Installation failed:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  async runScc(directory: string, force = false): Promise<SccMetrics> {
    // Check smart cache first
    const cached = this.getCachedMetrics(directory);
    if (!force && cached) {
      return cached.data;
    }

    if (!this.isInstalled()) {
      throw new Error("scc is not installed. Run install() first.");
    }

    // Build composite ignore file before running
    // SCC auto-detects .sccignore files, so we write to that
    await this.buildIgnoreFile(directory);

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

      child.on("close", async (code) => {
        if (code !== 0) {
          reject(new Error(`scc exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const output: SccJsonOutput = JSON.parse(stdout);
          const metrics = this.parseSccOutput(output);
          
          // Update smart cache with new results
          await this.updateCache(directory, metrics);
          this.staleDirectories.delete(directory);
          
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
    // SCC returns an array of language groups, each containing files
    const languageGroups = Array.isArray(output) ? output : [];
    
    // Calculate totals
    let totalLines = 0;
    let totalCode = 0;
    let totalComplexity = 0;
    
    const languageMap = new Map<string, SccLanguageMetrics>();
    const fileMetrics: SccFileMetrics[] = [];

    // Process each language group
    for (const group of languageGroups) {
      const files = group.Files || [];
      
      for (const file of files) {
        totalLines += file.Lines;
        totalCode += file.Code;
        totalComplexity += file.Complexity || 0;

        // Language aggregation
        const lang = file.Language || "Unknown";
        const existing = languageMap.get(lang);
        if (existing) {
          existing.files++;
          existing.lines += file.Lines;
          existing.code += file.Code;
          existing.comment += file.Comment;
          existing.blank += file.Blank;
          existing.complexity += file.Complexity || 0;
        } else {
          languageMap.set(lang, {
            language: lang,
            files: 1,
            lines: file.Lines,
            code: file.Code,
            comment: file.Comment,
            blank: file.Blank,
            complexity: file.Complexity || 0,
          });
        }

        fileMetrics.push({
          path: file.Filename,
          language: lang,
          lines: file.Lines,
          code: file.Code,
          comment: file.Comment,
          blank: file.Blank,
          complexity: file.Complexity || 0,
        });
      }
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
      this.smartCache.delete(directory);
      this.saveCache();
    } else {
      this.smartCache.clear();
      // Remove cache file entirely when clearing all
      try {
        if (existsSync(this.cacheFilePath)) {
          unlinkSync(this.cacheFilePath);
        }
      } catch (error) {
        // Ignore errors during file removal
      }
    }
  }

  /**
   * Build composite ignore file from multiple sources
   * Combines .fossil-settings/ignore-glob, .gitignore, and .mimoignore
   * Writes to .sccignore in the target directory (SCC auto-detects this)
   * @param directory The project directory to build ignore file for
   * @returns Path to the generated composite ignore file
   */
  async buildIgnoreFile(directory: string): Promise<string> {
    const ignoreSources = [
      { path: join(directory, ".fossil-settings", "ignore-glob"), label: ".fossil-settings/ignore-glob" },
      { path: join(directory, ".gitignore"), label: ".gitignore" },
      { path: join(directory, ".mimoignore"), label: ".mimoignore" },
    ];

    // Build composite content
    const compositeLines: string[] = [
      "# ============================================",
      "# Combined Ignore File for SCC",
      "# Generated by MIMO",
      "# ============================================",
      "",
    ];

    for (const source of ignoreSources) {
      if (existsSync(source.path)) {
        compositeLines.push(`# --- From: ${source.label} ---`);
        const content = readFileSync(source.path, "utf-8");
        compositeLines.push(content);
        compositeLines.push("");
      } else {
        logger.warn(`[scc] Warning: ${source.label} not found at ${source.path}`);
      }
    }

    // Write as .sccignore in the target directory
    // SCC automatically detects and uses .sccignore files
    const sccIgnorePath = join(directory, ".sccignore");
    writeFileSync(sccIgnorePath, compositeLines.join("\n"), "utf-8");

    return sccIgnorePath;
  }

  /**
   * Load cache from disk
   */
  loadCache(): void {
    try {
      if (existsSync(this.cacheFilePath)) {
        const content = readFileSync(this.cacheFilePath, "utf-8");
        const data: SccCacheData = JSON.parse(content);
        this.smartCache = new Map(Object.entries(data.entries || {}));
      }
    } catch (error) {
      logger.warn("[scc] Failed to load cache:", error);
      this.smartCache = new Map();
    }
  }

  /**
   * Save cache to disk atomically
   */
  async saveCache(): Promise<void> {
    try {
      const cacheDir = dirname(this.cacheFilePath);
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }

      const data: SccCacheData = {
        entries: Object.fromEntries(this.smartCache),
      };

      // Atomic write: write to temp file, then rename
      const tempPath = `${this.cacheFilePath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
      renameSync(tempPath, this.cacheFilePath);
    } catch (error) {
      logger.error("[scc] Failed to save cache:", error);
    }
  }

  /**
   * Invalidate cache for a specific directory or all directories
   * @param directory Optional directory path to invalidate. If not provided, clears all cache.
   */
  invalidateCache(directory?: string): void {
    if (directory) {
      const entry = this.smartCache.get(directory);
      if (entry) {
        entry.valid = false;
        this.smartCache.set(directory, entry);
      }
      this.markStale(directory);
    } else {
      // Mark all entries as invalid
      for (const [key, entry] of this.smartCache) {
        entry.valid = false;
        this.smartCache.set(key, entry);
        this.markStale(key);
      }
    }
    this.saveCache();
  }

  markStale(directory: string): void {
    this.staleDirectories.add(directory);
  }

  isStale(directory: string): boolean {
    return this.staleDirectories.has(directory);
  }

  /**
   * Get cache entry for a directory
   * @param directory Directory path
   * @returns Cache entry or undefined
   */
  getCacheEntry(directory: string): SccCacheEntry | undefined {
    return this.smartCache.get(directory);
  }

  /**
   * Get cached metrics if valid
   * @param directory Directory path
   * @returns Cached metrics if valid, null otherwise
   */
  getCachedMetrics(directory: string): SccCacheEntry | null {
    const entry = this.smartCache.get(directory);
    if (entry && entry.valid && entry.data) {
      return entry;
    }
    return null;
  }

  /**
   * Update cache with new metrics
   * @param directory Directory path
   * @param metrics SCC metrics to cache
   */
  async updateCache(directory: string, metrics: SccMetrics): Promise<void> {
    this.smartCache.set(directory, {
      valid: true,
      data: metrics,
      cachedAt: Date.now(),
    });
    await this.saveCache();
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
