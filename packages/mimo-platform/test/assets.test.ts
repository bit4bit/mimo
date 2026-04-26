import { describe, expect, test } from "bun:test";
import { getEmbeddedAssets } from "../src/assets";

describe("getEmbeddedAssets", () => {
  test("includes all required frontend assets", () => {
    const assets = getEmbeddedAssets();

    expect(assets.has("/vendor/marked.min.js")).toBe(true);
    expect(assets.has("/js/help-tooltip.js")).toBe(true);
    expect(assets.has("/js/session-finder.js")).toBe(true);
  });

  test("maps assets to non-empty blobs", () => {
    const assets = getEmbeddedAssets();

    expect((assets.get("/vendor/marked.min.js")?.size || 0) > 0).toBe(true);
    expect((assets.get("/js/help-tooltip.js")?.size || 0) > 0).toBe(true);
    expect((assets.get("/js/session-finder.js")?.size || 0) > 0).toBe(true);
  });
});
