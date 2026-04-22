// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";

import {
  parseTypeScriptImports,
  parsePythonImports,
  parseElixirImports,
  isExternalDependency,
  buildDependencyGraph,
  compareDependencyGraphs,
} from "../src/impact/dependency-parser.ts";

describe("dependency parser", () => {
  it("parses TypeScript ES6 imports", () => {
    const input = `
import foo from "./utils/foo";
import { bar } from "../shared/bar";
import * as baz from "../../lib/baz";
`;

    expect(parseTypeScriptImports(input)).toEqual([
      "./utils/foo",
      "../shared/bar",
      "../../lib/baz",
    ]);
  });

  it("parses TypeScript CommonJS require", () => {
    const input = `
const foo = require("./utils/foo");
const bar = require('../services/bar');
`;

    expect(parseTypeScriptImports(input)).toEqual([
      "./utils/foo",
      "../services/bar",
    ]);
  });

  it("parses Python import and from-import statements", () => {
    const input = `
import utils.helpers
from services.api import client
`;

    expect(parsePythonImports(input)).toEqual(["utils.helpers", "services.api"]);
  });

  it("parses Elixir alias/import/use/require statements", () => {
    const input = `
alias MyApp.Utils.Helpers
import MyApp.Services
use MyApp.Web, :controller
require Logger
`;

    expect(parseElixirImports(input)).toEqual([
      "MyApp.Utils.Helpers",
      "MyApp.Services",
      "MyApp.Web",
      "Logger",
    ]);
  });

  it("filters external dependencies", () => {
    expect(isExternalDependency("react", "typescript")).toBe(true);
    expect(isExternalDependency("./utils/foo", "typescript")).toBe(false);
    expect(isExternalDependency("utils.helpers", "python")).toBe(false);
  });

  it("detects added dependencies when comparing graphs", () => {
    const upstream = buildDependencyGraph([
      {
        source: "src/components",
        target: "src/services",
        file: "src/components/Button.tsx",
      },
    ]);

    const workspace = buildDependencyGraph([
      {
        source: "src/components",
        target: "src/services",
        file: "src/components/Button.tsx",
      },
      {
        source: "src/components",
        target: "src/utils",
        file: "src/components/Button.tsx",
      },
    ]);

    const result = compareDependencyGraphs(upstream, workspace);

    expect(result.added).toEqual([
      {
        source: "src/components",
        target: "src/utils",
        files: ["src/components/Button.tsx"],
        status: "added",
      },
    ]);
    expect(result.removed).toEqual([]);
  });

  it("detects removed dependencies when comparing graphs", () => {
    const upstream = buildDependencyGraph([
      {
        source: "src/services",
        target: "src/api",
        file: "src/services/user.ts",
      },
    ]);

    const workspace = buildDependencyGraph([]);

    const result = compareDependencyGraphs(upstream, workspace);

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([
      {
        source: "src/services",
        target: "src/api",
        files: ["src/services/user.ts"],
        status: "removed",
      },
    ]);
  });

  it("groups multiple files under the same dependency", () => {
    const upstream = buildDependencyGraph([]);
    const workspace = buildDependencyGraph([
      {
        source: "src/components",
        target: "src/utils",
        file: "src/components/Button.tsx",
      },
      {
        source: "src/components",
        target: "src/utils",
        file: "src/components/Form.tsx",
      },
    ]);

    const result = compareDependencyGraphs(upstream, workspace);

    expect(result.added).toHaveLength(1);
    expect(result.added[0]?.files).toEqual([
      "src/components/Button.tsx",
      "src/components/Form.tsx",
    ]);
  });
});
