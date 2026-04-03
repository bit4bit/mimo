import { Config, Keybindings, defaultConfig } from "../config/service.js";

export interface ValidationError {
  field: string;
  message: string;
}

export class ConfigValidator {
  private errors: ValidationError[] = [];

  validate(config: unknown): { valid: boolean; errors: ValidationError[]; sanitized: Config } {
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
      keybindings: this.validateKeybindings(configObj.keybindings),
      theme: this.validateTheme(configObj.theme),
      fontSize: this.validateFontSize(configObj.fontSize),
      fontFamily: this.validateFontFamily(configObj.fontFamily),
    };

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      sanitized,
    };
  }

  private validateKeybindings(keybindings: unknown): Keybindings {
    if (!keybindings || typeof keybindings !== "object") {
      this.errors.push({ field: "keybindings", message: "Keybindings must be an object" });
      return defaultConfig.keybindings;
    }

    const kb = keybindings as Record<string, unknown>;
    const validated: Partial<Keybindings> = {};

    const keybindingFields: (keyof Keybindings)[] = [
      "cancel_request",
      "commit",
      "find_file",
      "switch_project",
      "switch_session",
      "focus_left",
      "focus_center",
      "focus_right",
    ];

    for (const field of keybindingFields) {
      if (field in kb) {
        const value = kb[field];
        if (typeof value !== "string") {
          this.errors.push({
            field: `keybindings.${field}`,
            message: `Keybinding must be a string`,
          });
        } else if (!this.isValidKeybinding(value)) {
          this.errors.push({
            field: `keybindings.${field}`,
            message: `Invalid keybinding format: ${value}. Expected format like "C-x c" or "C-c C-c"`,
          });
        } else {
          validated[field] = value;
        }
      }
    }

    return { ...defaultConfig.keybindings, ...validated };
  }

  private isValidKeybinding(binding: string): boolean {
    // Allow formats like "C-x c", "C-c C-c", "M-x", etc.
    // C- = Ctrl, M- = Alt/Meta, S- = Shift
    const parts = binding.split(/\s+/);
    return parts.every((part) => {
      return part.match(/^(C-|M-|S-)*[a-zA-Z0-9]$/) !== null ||
             part.match(/^(C-|M-|S-)*(F[1-9]|F1[0-2])$/) !== null ||
             part.match(/^(C-|M-|S-)*(escape|tab|space|enter|backspace|delete|home|end|pageup|pagedown|up|down|left|right)$/i) !== null;
    });
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

  // Helper to check for duplicate keybindings
  checkDuplicateKeybindings(keybindings: Keybindings): ValidationError[] {
    const seen = new Map<string, string>();
    const duplicates: ValidationError[] = [];

    for (const [action, binding] of Object.entries(keybindings)) {
      if (seen.has(binding)) {
        duplicates.push({
          field: `keybindings.${action}`,
          message: `Duplicate keybinding: "${binding}" is also used for ${seen.get(binding)}`,
        });
      } else {
        seen.set(binding, action);
      }
    }

    return duplicates;
  }
}

export const configValidator = new ConfigValidator();
