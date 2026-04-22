// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("EditBuffer MCP open_file handler", () => {
  it("handles open_file_in_editbuffer messages and loads the file", () => {
    const source = readFileSync(
      join(import.meta.dir, "..", "public", "js", "edit-buffer.js"),
      "utf-8",
    );

    expect(source.includes("open_file_in_editbuffer")).toBe(true);
    expect(source.includes("fetchAndAddFile(sessionId, data.path")).toBe(true);
    expect(source.includes("data-buffer-id=\"edit\"")).toBe(true);
  });
});
