// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { autoName } from "../src/domain/sessions/auto-name.js";

describe("autoName", () => {
  it("derives a short name from the leading portion of the prompt", () => {
    expect(autoName("Refactor the auth middleware", [])).toBe(
      "Refactor the auth",
    );
  });

  it("keeps at most the first few words", () => {
    expect(autoName("add update remove rename purge wipe", [])).toBe(
      "add update remove rename",
    );
  });

  it("uses only the first non-empty line", () => {
    expect(autoName("\n\nFix the parser\nthen run tests", [])).toBe(
      "Fix the parser",
    );
  });

  it("collapses internal whitespace", () => {
    expect(autoName("update    the   README", [])).toBe("update the README");
  });

  it("truncates long prompts at a word boundary (~24 chars)", () => {
    const name = autoName(
      "Please refactor the authentication middleware to use the new token store",
      [],
    );
    expect(name.length).toBeLessThanOrEqual(24);
    expect(name.endsWith(" ")).toBe(false);
    expect(name).toBe("Please refactor the");
  });

  it("dedupes against existing names with a numeric suffix", () => {
    expect(autoName("Fix the bug", ["Fix the bug"])).toBe("Fix the bug (2)");
    expect(autoName("Fix the bug", ["Fix the bug", "Fix the bug (2)"])).toBe(
      "Fix the bug (3)",
    );
  });

  it("falls back to a generic default for empty/whitespace prompts", () => {
    expect(autoName("", [])).toBe("New thread");
    expect(autoName("   \n  ", [])).toBe("New thread");
  });

  it("dedupes the fallback default too", () => {
    expect(autoName("", ["New thread"])).toBe("New thread (2)");
  });
});
