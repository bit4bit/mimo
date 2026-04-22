// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "bun:test";
import {
  filterAvailableCommands,
  normalizeAvailableCommands,
} from "../src/sessions/available-commands";

describe("available commands normalization", () => {
  it("normalizes command objects with template", () => {
    const commands = normalizeAvailableCommands([
      {
        name: "/clear",
        description: "Clear thread context",
        template: "/clear",
      },
    ]);

    expect(commands).toEqual([
      {
        name: "/clear",
        description: "Clear thread context",
        template: "/clear",
      },
    ]);
  });

  it("normalizes string commands", () => {
    expect(normalizeAvailableCommands(["/help"])).toEqual([
      { name: "/help", description: undefined, template: undefined },
    ]);
  });

  it("drops invalid command entries", () => {
    expect(
      normalizeAvailableCommands([
        { foo: "bar" },
        null,
        { command: "/status", usage: "/status" },
      ]),
    ).toEqual([
      {
        name: "/status",
        description: undefined,
        template: "/status",
      },
    ]);
  });
});

describe("available commands filtering", () => {
  it("filters by name and description", () => {
    const commands = [
      { name: "/clear", description: "Clear thread" },
      { name: "/help", description: "List commands" },
    ];

    expect(filterAvailableCommands(commands, "clear")).toEqual([
      { name: "/clear", description: "Clear thread" },
    ]);
    expect(filterAvailableCommands(commands, "list")).toEqual([
      { name: "/help", description: "List commands" },
    ]);
  });
});
