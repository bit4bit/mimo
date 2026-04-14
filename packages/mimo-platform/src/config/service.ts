import { readFileSync, existsSync, writeFileSync } from "fs";
import { load, dump } from "js-yaml";
import { logger } from "../logger.js";

export interface Config {
  theme?: "dark" | "light";
  fontSize?: number;
  fontFamily?: string;
  sharedFossilServerPort?: number;
  streamingTimeoutMs?: number;
}

export const defaultConfig: Config = {
  theme: "dark",
  fontSize: 14,
  fontFamily: "monospace",
  sharedFossilServerPort: 8000,
  streamingTimeoutMs: 600000, // 10 minutes
};

export class ConfigService {
  private config: Config | null = null;
  private _configPath: string | null = null;

  constructor(configPath?: string) {
    this._configPath = configPath ?? null;
  }

  configure(configPath: string): void {
    this._configPath = configPath;
    // Clear cached config to reload from new path
    this.config = null;
  }

  private getConfigPath(): string | null {
    return this._configPath;
  }

  load(): Config {
    if (this.config) {
      return this.config;
    }

    const configPath = this.getConfigPath();
    if (!configPath) {
      // Can't determine config path yet, return defaults
      return defaultConfig;
    }

    if (!existsSync(configPath)) {
      // Create default config
      this.save(defaultConfig);
      return defaultConfig;
    }

    try {
      const content = readFileSync(configPath, "utf-8");
      const loaded = load(content) as Partial<Config>;

      this.config = {
        theme: loaded.theme ?? defaultConfig.theme,
        fontSize: loaded.fontSize ?? defaultConfig.fontSize,
        fontFamily: loaded.fontFamily ?? defaultConfig.fontFamily,
        sharedFossilServerPort:
          loaded.sharedFossilServerPort ?? defaultConfig.sharedFossilServerPort,
        streamingTimeoutMs:
          loaded.streamingTimeoutMs ?? defaultConfig.streamingTimeoutMs,
      };

      return this.config;
    } catch (error) {
      logger.error("Failed to load config:", error);
      return defaultConfig;
    }
  }

  save(config: Config): void {
    const configPath = this.getConfigPath();
    if (!configPath) {
      logger.error("Cannot save config: config path not available");
      return;
    }
    try {
      writeFileSync(configPath, dump(config), "utf-8");
      this.config = config;
    } catch (error) {
      logger.error("Failed to save config:", error);
    }
  }

  get(key: keyof Config): Config[keyof Config] {
    const config = this.load();
    return config[key];
  }

  set(key: keyof Config, value: unknown): void {
    const config = this.load();
    (config as Record<string, unknown>)[key] = value;
    this.save(config as Config);
  }
}

export const configService = new ConfigService();
