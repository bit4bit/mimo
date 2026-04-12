import { Config, defaultConfig } from "../config/service.js";

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

}

export const configValidator = new ConfigValidator();
