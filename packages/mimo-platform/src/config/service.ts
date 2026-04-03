import { readFileSync, existsSync, writeFileSync } from "fs";
import { load, dump } from "js-yaml";
import { getPaths } from "./paths.js";

export interface Keybindings {
  cancel_request: string;
  commit: string;
  find_file: string;
  switch_project: string;
  switch_session: string;
  focus_left: string;
  focus_center: string;
  focus_right: string;
}

export interface Config {
  keybindings: Keybindings;
  theme?: "dark" | "light";
  fontSize?: number;
  fontFamily?: string;
}

const defaultConfig: Config = {
  keybindings: {
    cancel_request: "C-c C-c",
    commit: "C-x c",
    find_file: "C-x C-f",
    switch_project: "C-x p",
    switch_session: "C-x s",
    focus_left: "C-x h",
    focus_center: "C-x j",
    focus_right: "C-x l",
  },
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
      
      // Merge with defaults
      this.config = {
        ...defaultConfig,
        ...loaded,
        keybindings: {
          ...defaultConfig.keybindings,
          ...loaded.keybindings,
        },
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

  getKeybindings(): Keybindings {
    return this.load().keybindings;
  }

  updateKeybindings(keybindings: Partial<Keybindings>): void {
    const config = this.load();
    config.keybindings = { ...config.keybindings, ...keybindings };
    this.save(config);
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
