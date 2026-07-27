// SPDX-License-Identifier: AGPL-3.0-only

export interface FaviconInput {
  id: string;
  name: string;
  color?: string;
  iconGlyph?: string;
}

const FALLBACK_GLYPH = "\u0000";

export function hashId(id: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = (h2 ^ (h1 >>> 0)) >>> 0;
  return combined;
}

export function hueFromId(id: string): number {
  return hashId(id) % 360;
}

export function glyphFromName(name: string): string {
  if (!name || name.length === 0) {
    return FALLBACK_GLYPH;
  }
  let firstGrapheme = name.charAt(0);
  if (typeof Intl !== "undefined" && typeof (Intl as any).Segmenter === "function") {
    try {
      const segmenter = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
      const iter = segmenter.segment(name)[Symbol.iterator]();
      const first = iter.next();
      if (!first.done && first.value && first.value.segment) {
        firstGrapheme = first.value.segment;
      }
    } catch {
      // fall through to charAt(0) result
    }
  }
  const upper = firstGrapheme.toUpperCase();
  if (upper.length === 0) {
    return FALLBACK_GLYPH;
  }
  return upper;
}

export function textColorForHue(hue: number): string {
  const rgb = hslToRgb(hue, 0.65, 0.52);
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}

export function textColorForColor(color: string): string {
  const rgb = parseCssColor(color);
  if (!rgb) {
    return "#ffffff";
  }
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}

export function buildFaviconSvg(input: FaviconInput): string {
  const glyph = input.iconGlyph ?? glyphFromName(input.name);
  const hasOverrideColor = typeof input.color === "string" && input.color.length > 0;
  const background = hasOverrideColor ? (input.color as string) : `hsl(${hueFromId(input.id)}, 65%, 52%)`;
  const foreground = hasOverrideColor
    ? textColorForColor(input.color as string)
    : textColorForHue(hueFromId(input.id));

  if (glyph === FALLBACK_GLYPH) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
      `<rect width="32" height="32" rx="7" fill="${escapeXmlAttribute(background)}"/>` +
      `<circle cx="16" cy="16" r="6" fill="${escapeXmlAttribute(foreground)}"/>` +
      `</svg>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="${escapeXmlAttribute(background)}"/>` +
    `<text x="16" y="23" font-size="18" font-weight="700" text-anchor="middle" ` +
    `fill="${escapeXmlAttribute(foreground)}" font-family="system-ui, -apple-system, sans-serif">` +
    `${escapeXmlText(glyph)}</text></svg>`
  );
}

export function buildFaviconDataUri(input: FaviconInput): string {
  const svg = buildFaviconSvg(input);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function buildDefaultFaviconSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="#1f2937"/>` +
    `<text x="16" y="23" font-size="18" font-weight="700" text-anchor="middle" ` +
    `fill="#ffffff" font-family="system-ui, -apple-system, sans-serif">M</text></svg>`
  );
}

export function buildDefaultFaviconDataUri(): string {
  return `data:image/svg+xml,${encodeURIComponent(buildDefaultFaviconSvg())}`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (hp >= 1 && hp < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hp >= 2 && hp < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hp >= 3 && hp < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hp >= 4 && hp < 5) { r1 = x; g1 = 0; b1 = c; }
  else if (hp >= 5 && hp < 6) { r1 = c; g1 = 0; b1 = x; }
  const m = l - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

function parseCssColor(color: string): [number, number, number] | null {
  const hexMatch = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  const hexShort = color.trim().match(/^#([0-9a-f]{3})$/i);
  if (hexShort) {
    const hex = hexShort[1];
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  const rgbMatch = color.trim().match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
  }
  return null;
}

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}