import {
  Config,
  defaultConfig,
  defaultSessionKeybindings,
  SessionKeybindingsConfig,
} from "../config/service.js";

export interface ValidationError {
  field: string;
  message: string;
}

export class ConfigValidator {
  private errors: ValidationError[] = [];

  validate(config: unknown): {
    valid: boolean;
    errors: ValidationError[];
    sanitized: Config;
  } {
    this.errors = [];

    if (!config || typeof config !== "object") {
      return {
        valid: false,
        errors: [{ field: "root", message: "Config must be an object" }],
        sanitized: defaultConfig,
      };
    }

    const configObj = config as Record<string, unknown>;
    const sanitized: Config = {
      theme: this.validateTheme(configObj.theme),
      fontSize: this.validateFontSize(configObj.fontSize),
      fontFamily: this.validateFontFamily(configObj.fontFamily),
      sharedFossilServerPort: this.validateSharedFossilServerPort(
        configObj.sharedFossilServerPort,
      ),
      sessionKeybindings: this.validateSessionKeybindings(
        configObj.sessionKeybindings,
      ),
    };

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      sanitized,
    };
  }

  private validateTheme(theme: unknown): "dark" | "light" {
    if (theme === undefined) return defaultConfig.theme!;

    if (theme !== "dark" && theme !== "light") {
      this.errors.push({
        field: "theme",
        message: `Theme must be "dark" or "light", got: ${theme}`,
      });
      return defaultConfig.theme!;
    }
    return theme;
  }

  private validateFontSize(fontSize: unknown): number {
    if (fontSize === undefined) return defaultConfig.fontSize!;

    const size = Number(fontSize);
    if (isNaN(size) || size < 8 || size > 32) {
      this.errors.push({
        field: "fontSize",
        message: `Font size must be a number between 8 and 32, got: ${fontSize}`,
      });
      return defaultConfig.fontSize!;
    }
    return size;
  }

  private validateFontFamily(fontFamily: unknown): string {
    if (fontFamily === undefined) return defaultConfig.fontFamily!;

    if (typeof fontFamily !== "string" || fontFamily.length === 0) {
      this.errors.push({
        field: "fontFamily",
        message: `Font family must be a non-empty string`,
      });
      return defaultConfig.fontFamily!;
    }
    return fontFamily;
  }

  private validateSharedFossilServerPort(port: unknown): number {
    if (port === undefined) return defaultConfig.sharedFossilServerPort!;

    const portNum = Number(port);
    if (
      isNaN(portNum) ||
      portNum < 1024 ||
      portNum > 65535 ||
      !Number.isInteger(portNum)
    ) {
      this.errors.push({
        field: "sharedFossilServerPort",
        message: `Port must be an integer between 1024 and 65535, got: ${port}`,
      });
      return defaultConfig.sharedFossilServerPort!;
    }
    return portNum;
  }

  private validateSessionKeybindings(
    keybindings: unknown,
  ): SessionKeybindingsConfig {
    if (keybindings === undefined) {
      return { ...defaultSessionKeybindings };
    }

    if (!keybindings || typeof keybindings !== "object") {
      this.errors.push({
        field: "sessionKeybindings",
        message: "sessionKeybindings must be an object",
      });
      return { ...defaultSessionKeybindings };
    }

    const raw = keybindings as Record<string, unknown>;
    const sanitized: SessionKeybindingsConfig = { ...defaultSessionKeybindings };
    const supportedKeys: Array<keyof SessionKeybindingsConfig> = [
      "newThread",
      "nextThread",
      "previousThread",
      "commit",
      "projectNotes",
      "sessionNotes",
      "shortcutsHelp",
      "closeModal",
    ];

    for (const key of supportedKeys) {
      const value = raw[key];
      if (value === undefined) {
        continue;
      }
      if (typeof value !== "string" || value.trim().length === 0) {
        this.errors.push({
          field: `sessionKeybindings.${key}`,
          message: `${key} must be a non-empty string`,
        });
        continue;
      }
      sanitized[key] = value.trim();
    }

    return sanitized;
  }
}

export const configValidator = new ConfigValidator();
