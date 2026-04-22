// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

describe("Development Scripts Integration Test", () => {
  const packageJsonPath = join(__dirname, "..", "package.json");

  test("should have all required scripts defined", () => {
    const packageJsonContent = readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);
    const scripts = packageJson.scripts;

    expect(scripts.dev).toBeDefined();
    expect(scripts.start).toBeDefined();
    expect(scripts.test).toBeDefined();
    expect(scripts["test:watch"]).toBeDefined();
    expect(scripts.build).toBeDefined();
    expect(scripts.typecheck).toBeDefined();
  });

  test("should have correct dev script with watch mode", () => {
    const packageJsonContent = readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);
    expect(packageJson.scripts.dev).toContain("--watch");
  });

  test("should have build script targeting bun", () => {
    const packageJsonContent = readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);
    expect(packageJson.scripts.build).toContain("--target bun");
  });
});
