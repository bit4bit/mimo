import { describe, expect, test } from "bun:test";
import { resolveEmbeddedAssetUrl } from "../src/assets";

describe("resolveEmbeddedAssetUrl", () => {
  test("resolves direct public path assets", () => {
    const result = resolveEmbeddedAssetUrl(
      "packages/mimo-platform/public/js/help-tooltip-a1b2c3d4.js",
    );

    expect(result).toBe("/js/help-tooltip.js");
  });

  test("resolves bunfs-root assets by file name", () => {
    const result = resolveEmbeddedAssetUrl(
      "/$bunfs/root/session-finder-a1b2c3d4.js",
    );

    expect(result).toBe("/js/session-finder.js");
  });

  test("resolves bunfs-root assets with non-hex hash", () => {
    const result = resolveEmbeddedAssetUrl(
      "/$bunfs/root/session-finder-mrh841j3.js",
    );

    expect(result).toBe("/js/session-finder.js");
  });

  test("resolves vendor assets by file name", () => {
    const result = resolveEmbeddedAssetUrl(
      "/$bunfs/root/marked-a1b2c3d4.min.js",
    );

    expect(result).toBe("/vendor/marked.min.js");
  });

  test("resolves vendor assets with non-hex hash", () => {
    const result = resolveEmbeddedAssetUrl(
      "/$bunfs/root/marked-mrh841j3.min.js",
    );

    expect(result).toBe("/vendor/marked.min.js");
  });

  test("returns null for unknown files", () => {
    const result = resolveEmbeddedAssetUrl("/$bunfs/root/unknown-a1b2c3d4.js");

    expect(result).toBeNull();
  });
});
