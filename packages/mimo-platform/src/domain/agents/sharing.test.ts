// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { authorizeUse, validateShareInput } from "./sharing.js";

const baseAgent = {
  owner: "alice",
  sharedWith: [] as Array<{ username: string; permission: "use" }>,
};

describe("authorizeUse", () => {
  it("authorizes the owner", () => {
    expect(authorizeUse(baseAgent, "alice")).toBe(true);
  });

  it("authorizes a user shared with use permission", () => {
    const agent = {
      ...baseAgent,
      sharedWith: [{ username: "bob", permission: "use" as const }],
    };
    expect(authorizeUse(agent, "bob")).toBe(true);
  });

  it("does not authorize an unrelated user", () => {
    const agent = {
      ...baseAgent,
      sharedWith: [{ username: "bob", permission: "use" as const }],
    };
    expect(authorizeUse(agent, "carol")).toBe(false);
  });

  it("treats a missing sharedWith list as empty", () => {
    const agent = { owner: "alice" };
    expect(authorizeUse(agent, "bob")).toBe(false);
    expect(authorizeUse(agent, "alice")).toBe(true);
  });
});

describe("validateShareInput", () => {
  it("accepts sharing with an existing, not-yet-shared user", () => {
    const result = validateShareInput({
      agent: baseAgent,
      targetUsername: "bob",
      targetExists: true,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects sharing with self (the owner)", () => {
    const result = validateShareInput({
      agent: baseAgent,
      targetUsername: "alice",
      targetExists: true,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects sharing with a non-existent user", () => {
    const result = validateShareInput({
      agent: baseAgent,
      targetUsername: "ghost",
      targetExists: false,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects sharing with an already-shared user", () => {
    const agent = {
      ...baseAgent,
      sharedWith: [{ username: "bob", permission: "use" as const }],
    };
    const result = validateShareInput({
      agent,
      targetUsername: "bob",
      targetExists: true,
    });
    expect(result.ok).toBe(false);
  });
});
