// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import {
  hashId,
  hueFromId,
  glyphFromName,
  textColorForHue,
  buildFaviconSvg,
  buildFaviconDataUri,
  buildDefaultFaviconDataUri,
} from "./favicons.js";

describe("favicon helper", () => {
  describe("hashId", () => {
    it("returns a deterministic number for the same input", () => {
      expect(hashId("p-123")).toBe(hashId("p-123"));
    });

    it("returns different numbers for different inputs", () => {
      expect(hashId("p-123")).not.toBe(hashId("p-456"));
    });

    it("returns a non-negative 32-bit value", () => {
      const h = hashId("anything");
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    });
  });

  describe("hueFromId", () => {
    it("returns a value in [0, 360)", () => {
      for (const id of ["a", "b", "c", "p-1", "p-2", "long-uuid-123"]) {
        const hue = hueFromId(id);
        expect(hue).toBeGreaterThanOrEqual(0);
        expect(hue).toBeLessThan(360);
      }
    });

    it("is deterministic for the same id", () => {
      expect(hueFromId("p-123")).toBe(hueFromId("p-123"));
    });

    it("differs across distinct ids (for at least some pair)", () => {
      const hues = new Set(["p-1", "p-2", "p-3", "p-4", "p-5"].map(hueFromId));
      expect(hues.size).toBeGreaterThan(1);
    });
  });

  describe("glyphFromName", () => {
    it("returns the first grapheme uppercased", () => {
      expect(glyphFromName("my-cool-project")).toBe("M");
      expect(glyphFromName("alpha")).toBe("A");
    });

    it("returns a fallback sentinel for empty names", () => {
      const g = glyphFromName("");
      expect(typeof g).toBe("string");
      expect(g.length).toBeGreaterThan(0);
      // sentinel must not be a visible project letter
      expect(g).not.toMatch(/^[A-Z0-9]$/);
    });

    it("returns a fallback for whitespace-only names", () => {
      const g = glyphFromName("   ");
      expect(typeof g).toBe("string");
      expect(g.length).toBeGreaterThan(0);
    });
  });

  describe("textColorForHue", () => {
    it("returns dark text for light backgrounds", () => {
      // yellow-ish hue ~ 60
      expect(textColorForHue(60)).toBe("#1a1a1a");
    });

    it("returns light text for dark backgrounds", () => {
      // blue-ish hue ~ 240
      expect(textColorForHue(240)).toBe("#ffffff");
    });

    it("returns a valid hex color string for every hue", () => {
      for (let h = 0; h < 360; h += 17) {
        const c = textColorForHue(h);
        expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });

  describe("buildFaviconSvg", () => {
    it("contains the rounded rect background and text glyph", () => {
      const svg = buildFaviconSvg({ id: "p-1", name: "alpha" });
      expect(svg).toContain("<svg");
      expect(svg).toContain("<rect");
      expect(svg).toContain('rx="7"');
      expect(svg).toContain("<text");
      expect(svg).toContain(">A</text>");
    });

    it("renders a fallback circle for empty names", () => {
      const svg = buildFaviconSvg({ id: "p-1", name: "" });
      expect(svg).toContain("<circle");
      expect(svg).not.toContain("<text");
    });

    it("uses an explicit color override instead of the derived hue", () => {
      const svg = buildFaviconSvg({
        id: "p-1",
        name: "alpha",
        color: "#ff5500",
      });
      expect(svg).toContain("#ff5500");
      expect(svg).not.toContain("hsl(");
    });

    it("uses an explicit iconGlyph override instead of the derived glyph", () => {
      const svg = buildFaviconSvg({ id: "p-1", name: "alpha", iconGlyph: "Z" });
      expect(svg).toContain(">Z</text>");
      expect(svg).not.toContain(">A</text>");
    });

    it("is deterministic: same input → identical output", () => {
      const a = buildFaviconSvg({ id: "p-123", name: "my-cool-project" });
      const b = buildFaviconSvg({ id: "p-123", name: "my-cool-project" });
      expect(a).toBe(b);
    });

    it("differs across distinct ids (for some pair)", () => {
      const a = buildFaviconSvg({ id: "p-1", name: "alpha" });
      const b = buildFaviconSvg({ id: "p-2", name: "alpha" });
      expect(a).not.toBe(b);
    });
  });

  describe("buildFaviconDataUri", () => {
    it("returns a data:image/svg+xml URI", () => {
      const uri = buildFaviconDataUri({ id: "p-1", name: "alpha" });
      expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    });

    it("is deterministic: same input → identical URI", () => {
      const a = buildFaviconDataUri({ id: "p-123", name: "my-cool-project" });
      const b = buildFaviconDataUri({ id: "p-123", name: "my-cool-project" });
      expect(a).toBe(b);
    });

    it("encodes the SVG so it survives a decode round-trip", () => {
      const uri = buildFaviconDataUri({ id: "p-1", name: "alpha" });
      const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
      expect(svg).toContain("<svg");
      expect(svg).toContain(">A</text>");
    });
  });

  describe("buildDefaultFaviconDataUri", () => {
    it("returns a data:image/svg+xml URI", () => {
      expect(
        buildDefaultFaviconDataUri().startsWith("data:image/svg+xml,"),
      ).toBe(true);
    });

    it("is deterministic", () => {
      expect(buildDefaultFaviconDataUri()).toBe(buildDefaultFaviconDataUri());
    });

    it("does not reference any project id or name", () => {
      const svg = decodeURIComponent(
        buildDefaultFaviconDataUri().slice("data:image/svg+xml,".length),
      );
      expect(svg).not.toContain("hsl(");
      expect(svg).toContain(">M</text>");
    });
  });

  describe("purity", () => {
    it("does not perform I/O: generating a favicon returns synchronously", () => {
      // Calling buildFaviconDataUri with any input must not throw or block.
      const uri = buildFaviconDataUri({ id: "x", name: "y" });
      expect(typeof uri).toBe("string");
    });
  });
});
