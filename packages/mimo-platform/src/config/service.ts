import { readFileSync, existsSync, writeFileSync } from "fs";
import { load, dump } from "js-yaml";
import { getPaths } from "./paths.js";

export interface Config {
  theme?: "dark" | "light";
  fontSize?: number;
  fontFamily?: string;
}

export const defaultConfig: Config = {
  theme: "dark",
  fontSize: 14,
  fontFamily: "monospace",
};

export class ConfigService {
  private config: Config | null = null;
  private _configPath: string | null = null;

  private get configPath(): string {
    if (!this._configPath) {
      this._configPath = getPaths().config;
    }
    return this._configPath;
  }

  load(): Config {
    if (this.config) {
      return this.config;
    }

    if (!existsSync(this.configPath)) {
      // Create default config
      this.save(defaultConfig);
      return defaultConfig;
    }

    try {
      const content = readFileSync(this.configPath, "utf-8");
      const loaded = load(content) as Partial<Config>;
      
      this.config = {
        theme: loaded.theme ?? defaultConfig.theme,
        fontSize: loaded.fontSize ?? defaultConfig.fontSize,
        fontFamily: loaded.fontFamily ?? defaultConfig.fontFamily,
      };
      
      return this.config;
    } catch (error) {
      console.error("Failed to load config:", error);
      return defaultConfig;
    }
  }

  save(config: Config): void {
    try {
      writeFileSync(this.configPath, dump(config), "utf-8");
      this.config = config;
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }

  get(key: keyof Config): Config[keyof Config] {
    const config = this.load();
    return config[key];
  }

  set(key: keyof Config, value: unknown): void {
    const config = this.load();
    (config as Record<string, unknown>)[key] = value;
    this.save(config);
  }
}

export const configService = new ConfigService();
