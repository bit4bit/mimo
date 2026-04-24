import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ConfigService, defaultSummaryPrompt } from "../src/config/service.js";

describe("sanitizeSummaryConfig", () => {
  it("should return default prompt when summary config is missing", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "mimo-summary-config-test-"));
    try {
      const mimoDir = join(tempDir, ".mimo");
      mkdirSync(mimoDir, { recursive: true });
      writeFileSync(
        join(mimoDir, "config.yaml"),
        "theme: dark\n",
      );

      const isolatedConfigService = new ConfigService(
        join(mimoDir, "config.yaml"),
      );
      const loadedConfig = isolatedConfigService.load();

      expect(loadedConfig.summary?.prompt).toBe(defaultSummaryPrompt);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should use custom prompt when provided in config", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "mimo-summary-config-test-"));
    try {
      const mimoDir = join(tempDir, ".mimo");
      mkdirSync(mimoDir, { recursive: true });
      writeFileSync(
        join(mimoDir, "config.yaml"),
        'theme: dark\nsummary:\n  prompt: "Custom summary prompt"',
      );

      const isolatedConfigService = new ConfigService(
        join(mimoDir, "config.yaml"),
      );
      const loadedConfig = isolatedConfigService.load();

      expect(loadedConfig.summary?.prompt).toBe("Custom summary prompt");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should use default prompt when summary.prompt is empty", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "mimo-summary-config-test-"));
    try {
      const mimoDir = join(tempDir, ".mimo");
      mkdirSync(mimoDir, { recursive: true });
      writeFileSync(
        join(mimoDir, "config.yaml"),
        "theme: dark\nsummary:\n  prompt: \"\"",
      );

      const isolatedConfigService = new ConfigService(
        join(mimoDir, "config.yaml"),
      );
      const loadedConfig = isolatedConfigService.load();

      expect(loadedConfig.summary?.prompt).toBe(defaultSummaryPrompt);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});