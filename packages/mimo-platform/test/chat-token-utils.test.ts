// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";

const {
  splitTokenAffixes,
  normalizeFileQuery,
  stripLineReference,
  isLikelyFileToken,
} = require("../public/js/chat-token-utils.js");

// --- splitTokenAffixes ---

describe("splitTokenAffixes", () => {
  it("returns empty prefix/suffix for a plain path token", () => {
    expect(splitTokenAffixes("config/service.ts")).toEqual({
      prefix: "",
      core: "config/service.ts",
      suffix: "",
    });
  });

  it("strips backtick wrappers", () => {
    expect(splitTokenAffixes("`config/service.ts`")).toEqual({
      prefix: "`",
      core: "config/service.ts",
      suffix: "`",
    });
  });

  it("strips markdown bold + backtick wrappers (**`...`**)", () => {
    expect(splitTokenAffixes("**`config/service.ts`**")).toEqual({
      prefix: "**`",
      core: "config/service.ts",
      suffix: "`**",
    });
  });

  it("strips markdown bold wrappers (**...**)", () => {
    expect(splitTokenAffixes("**config/service.ts**")).toEqual({
      prefix: "**",
      core: "config/service.ts",
      suffix: "**",
    });
  });

  it("strips parentheses", () => {
    expect(splitTokenAffixes("(src/routes.ts)")).toEqual({
      prefix: "(",
      core: "src/routes.ts",
      suffix: ")",
    });
  });

  it("strips square brackets", () => {
    expect(splitTokenAffixes("[src/routes.ts]")).toEqual({
      prefix: "[",
      core: "src/routes.ts",
      suffix: "]",
    });
  });

  it("strips leading quote", () => {
    expect(splitTokenAffixes("'src/app.ts'")).toEqual({
      prefix: "'",
      core: "src/app.ts",
      suffix: "'",
    });
  });

  it("strips trailing sentence period", () => {
    expect(splitTokenAffixes("src/app.ts.")).toEqual({
      prefix: "",
      core: "src/app.ts",
      suffix: ".",
    });
  });

  it("strips trailing comma", () => {
    expect(splitTokenAffixes("src/app.ts,")).toEqual({
      prefix: "",
      core: "src/app.ts",
      suffix: ",",
    });
  });

  it("strips trailing exclamation mark", () => {
    expect(splitTokenAffixes("src/app.ts!")).toEqual({
      prefix: "",
      core: "src/app.ts",
      suffix: "!",
    });
  });

  it("strips mixed prefix and suffix", () => {
    expect(splitTokenAffixes("**src/app.ts.**")).toEqual({
      prefix: "**",
      core: "src/app.ts",
      suffix: ".**",
    });
  });

  it("returns full string as prefix when no file-safe chars found", () => {
    expect(splitTokenAffixes("***")).toEqual({
      prefix: "***",
      core: "",
      suffix: "",
    });
  });

  it("handles empty string", () => {
    expect(splitTokenAffixes("")).toEqual({
      prefix: "",
      core: "",
      suffix: "",
    });
  });
});

// --- stripLineReference ---

describe("stripLineReference", () => {
  it("removes trailing line number", () => {
    expect(stripLineReference("src/app.ts:42")).toBe("src/app.ts");
  });

  it("removes trailing line:col reference", () => {
    expect(stripLineReference("src/app.ts:42:10")).toBe("src/app.ts");
  });

  it("leaves plain path unchanged", () => {
    expect(stripLineReference("src/app.ts")).toBe("src/app.ts");
  });
});

// --- normalizeFileQuery ---

describe("normalizeFileQuery", () => {
  it("removes leading ./", () => {
    expect(normalizeFileQuery("./src/app.ts")).toBe("src/app.ts");
  });

  it("removes file:// prefix", () => {
    expect(normalizeFileQuery("file:///src/app.ts")).toBe("/src/app.ts");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(normalizeFileQuery("src\\\\app.ts")).toBe("src/app.ts");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeFileQuery(null)).toBe("");
    expect(normalizeFileQuery(undefined)).toBe("");
  });
});

// --- isLikelyFileToken ---

describe("isLikelyFileToken", () => {
  const exts = new Set(["ts", "js", "md", "tsx", "json"]);

  it("returns true for a path token with slash", () => {
    expect(isLikelyFileToken("src/app.ts", exts)).toBe(true);
  });

  it("returns true for a filename with known extension", () => {
    expect(isLikelyFileToken("service.ts", exts)).toBe(true);
  });

  it("returns false for a version string like 1.2.3", () => {
    expect(isLikelyFileToken("1.2.3", exts)).toBe(false);
  });

  it("returns false for a version string like v2.0", () => {
    expect(isLikelyFileToken("v2.0", exts)).toBe(false);
  });

  it("returns false for a filename with unknown extension", () => {
    expect(isLikelyFileToken("schema.proto", exts)).toBe(false);
  });

  it("returns true for custom extension when provided", () => {
    const withProto = new Set([...exts, "proto"]);
    expect(isLikelyFileToken("schema.proto", withProto)).toBe(true);
  });

  it("returns false for http URLs", () => {
    expect(isLikelyFileToken("https://example.com/file.ts", exts)).toBe(false);
  });

  it("returns false for empty token", () => {
    expect(isLikelyFileToken("", exts)).toBe(false);
  });
});
