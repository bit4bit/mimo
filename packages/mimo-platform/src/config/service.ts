import { readFileSync, existsSync, writeFileSync } from "fs";
import { load, dump } from "js-yaml";
import { logger } from "../logger.js";

export interface GlobalKeybindingsConfig {
  newThread?: string;
  nextThread?: string;
  previousThread?: string;
  openFileFinder?: string;
  openSessionFinder?: string;
}

export interface SummaryConfig {
  prompt?: string;
}

export const defaultGlobalKeybindings: GlobalKeybindingsConfig = {
  newThread: "Control+Shift+N",
  nextThread: "Control+Shift+ArrowRight",
  previousThread: "Control+Shift+ArrowLeft",
  openFileFinder: "Control+Shift+F",
  openSessionFinder: "Control+Shift+3",
};

export interface SessionKeybindingsConfig {
  newThread?: string;
  nextThread?: string;
  previousThread?: string;
  commit?: string;
  projectNotes?: string;
  sessionNotes?: string;
  shortcutsHelp?: string;
  closeModal?: string;
  openFileFinder?: string;
  closeFile?: string;
  nextFile?: string;
  previousFile?: string;
  nextLeftBuffer?: string;
  previousLeftBuffer?: string;
  toggleRightFrame?: string;
  toggleExpertMode?: string;
  expertInput?: string;
  moveFocusUp?: string;
  moveFocusDown?: string;
  centerFocus?: string;
  increaseFocus?: string;
  decreaseFocus?: string;
  approvePatch?: string;
  declinePatch?: string;
}

export interface Config {
  theme?: "dark" | "light";
  fontSize?: number;
  fontFamily?: string;
  sharedFossilServerPort?: number;
  streamingTimeoutMs?: number;
  sessionKeybindings?: SessionKeybindingsConfig;
  globalKeybindings?: GlobalKeybindingsConfig;
  chatFileExtensions?: string[];
  summary?: SummaryConfig;
}

export const defaultSessionKeybindings: SessionKeybindingsConfig = {
  newThread: "Mod+Shift+N",
  nextThread: "Mod+Shift+ArrowRight",
  previousThread: "Mod+Shift+ArrowLeft",
  commit: "Mod+Shift+M",
  projectNotes: "Mod+Shift+,",
  sessionNotes: "Mod+Shift+.",
  shortcutsHelp: "Mod+Shift+/",
  closeModal: "Escape",
  openFileFinder: "Mod+Shift+F",
  closeFile: "Alt+Shift+W",
  nextFile: "Mod+Alt+ArrowRight",
  previousFile: "Mod+Alt+ArrowLeft",
  nextLeftBuffer: "Alt+Shift+PageDown",
  previousLeftBuffer: "Alt+Shift+PageUp",
  toggleRightFrame: "Alt+Shift+Control+F",
  toggleExpertMode: "Alt+Shift+E",
  expertInput: "Enter",
  moveFocusUp: "Alt+ArrowUp",
  moveFocusDown: "Alt+ArrowDown",
  centerFocus: "Alt+Enter",
  increaseFocus: "Alt+Shift+ArrowRight",
  decreaseFocus: "Alt+Shift+ArrowLeft",
  approvePatch: "Control+Enter",
  declinePatch: "Alt+Shift+G",
};

export const defaultChatFileExtensions: string[] = [
  // Web
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "svg",
  // JavaScript / TypeScript
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "d.ts",
  // Python
  "py",
  "pyi",
  // Ruby
  "rb",
  "rake",
  // Rust
  "rs",
  // Go
  "go",
  // JVM
  "java",
  "kt",
  "scala",
  "clj",
  // C / C++
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  // C# / .NET
  "cs",
  // PHP
  "php",
  // Swift / Obj-C
  "swift",
  "m",
  // Shell
  "sh",
  "bash",
  "zsh",
  "fish",
  // Config / data
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "ini",
  "env",
  // Docs
  "md",
  "mdx",
  "txt",
  "rst",
  // Database
  "sql",
  // Other
  "lock",
  "csv",
  "r",
  "ex",
  "exs",
  "lua",
  "elm",
];

export const defaultConfig: Config = {
  theme: "dark",
  fontSize: 14,
  fontFamily: "monospace",
  sharedFossilServerPort: 8000,
  streamingTimeoutMs: 600000, // 10 minutes
  sessionKeybindings: { ...defaultSessionKeybindings },
  globalKeybindings: { ...defaultGlobalKeybindings },
  chatFileExtensions: [...defaultChatFileExtensions],
};

function sanitizeSessionKeybindings(
  keybindings: unknown,
): SessionKeybindingsConfig {
  if (!keybindings || typeof keybindings !== "object") {
    return { ...defaultSessionKeybindings };
  }

  const raw = keybindings as Record<string, unknown>;
  const result: SessionKeybindingsConfig = { ...defaultSessionKeybindings };
  const supportedKeys: Array<keyof SessionKeybindingsConfig> = [
    "newThread",
    "nextThread",
    "previousThread",
    "commit",
    "projectNotes",
    "sessionNotes",
    "shortcutsHelp",
    "closeModal",
    "openFileFinder",
    "closeFile",
    "nextFile",
    "previousFile",
    "nextLeftBuffer",
    "previousLeftBuffer",
    "toggleRightFrame",
    "toggleExpertMode",
    "expertInput",
    "increaseFocus",
    "decreaseFocus",
    "approvePatch",
    "declinePatch",
  ];

  for (const key of supportedKeys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) {
      result[key] = value.trim();
    }
  }

  return result;
}

function sanitizeGlobalKeybindings(
  keybindings: unknown,
): GlobalKeybindingsConfig {
  if (!keybindings || typeof keybindings !== "object") {
    return { ...defaultGlobalKeybindings };
  }

  const raw = keybindings as Record<string, unknown>;
  const result: GlobalKeybindingsConfig = { ...defaultGlobalKeybindings };
  const supportedKeys: Array<keyof GlobalKeybindingsConfig> = [
    "newThread",
    "nextThread",
    "previousThread",
    "openFileFinder",
    "openSessionFinder",
  ];

  for (const key of supportedKeys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) {
      result[key] = value.trim();
    }
  }

  return result;
}

function sanitizeChatFileExtensions(extensions: unknown): string[] {
  if (!Array.isArray(extensions)) {
    return [...defaultChatFileExtensions];
  }
  const merged = new Set([...defaultChatFileExtensions]);
  for (const ext of extensions) {
    if (typeof ext === "string" && ext.trim().length > 0) {
      merged.add(ext.trim().toLowerCase().replace(/^\./, ""));
    }
  }
  return Array.from(merged);
}

export const defaultSummaryPrompt =
  "Analyze the following conversation history in chronological order. Produce a concise structured summary covering: what was done (actions taken, files created/modified), main topics discussed, decisions made, current state, and any open questions. History:";

function sanitizeSummaryConfig(config: unknown): SummaryConfig {
  if (!config || typeof config !== "object") {
    return { prompt: defaultSummaryPrompt };
  }
  const raw = config as Record<string, unknown>;
  const result: SummaryConfig = { prompt: defaultSummaryPrompt };
  if (typeof raw.prompt === "string" && raw.prompt.trim().length > 0) {
    result.prompt = raw.prompt.trim();
  }
  return result;
}

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
        sessionKeybindings: sanitizeSessionKeybindings(
          loaded.sessionKeybindings,
        ),
        globalKeybindings: sanitizeGlobalKeybindings(loaded.globalKeybindings),
        chatFileExtensions: sanitizeChatFileExtensions(
          loaded.chatFileExtensions,
        ),
        summary: sanitizeSummaryConfig(loaded.summary),
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
