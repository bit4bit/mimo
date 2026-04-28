// assets.ts - Embed all static assets for compiled executable
// This module imports all public assets with `with { type: "file" }`
// which tells Bun to embed them in the compiled binary.
//
// Usage in index.tsx:
//   import "./assets.js";
//   import { embeddedFiles } from "bun";
//   const assets = getEmbeddedAssets(); // Helper below

// JavaScript files
import chatJs from "../public/js/chat.js" with { type: "file" };
import chatThreadsJs from "../public/js/chat-threads.js" with { type: "file" };
import chatTokenUtilsJs from "../public/js/chat-token-utils.js" with { type: "file" };
import commitJs from "../public/js/commit.js" with { type: "file" };
import diffJs from "../public/js/diff.js" with { type: "file" };
import editBufferJs from "../public/js/edit-buffer.js" with { type: "file" };
import expertUtilsJs from "../public/js/expert-utils.js" with { type: "file" };
import helpTooltipJs from "../public/js/help-tooltip.js" with { type: "file" };
import notesJs from "../public/js/notes.js" with { type: "file" };
import patchBufferJs from "../public/js/patch-buffer.js" with { type: "file" };
import sessionCloneJs from "../public/js/session-clone.js" with { type: "file" };
import sessionFinderJs from "../public/js/session-finder.js" with { type: "file" };
import sessionKeybindingsJs from "../public/js/session-keybindings.js" with { type: "file" };
import summaryBufferJs from "../public/js/summary-buffer.js" with { type: "file" };
import utilsJs from "../public/js/utils.js" with { type: "file" };

// Vendor files
import highlightCss from "../public/vendor/highlight/atom-one-dark.min.css" with { type: "file" };
import highlightElixirJs from "../public/vendor/highlight/elixir.min.js" with { type: "file" };
import highlightJs from "../public/vendor/highlight/highlight.min.js" with { type: "file" };
import markedJs from "../public/vendor/marked.min.js" with { type: "file" };

const EMBEDDED_ASSET_PATHS: Record<string, string> = {
  "/js/chat.js": chatJs,
  "/js/chat-threads.js": chatThreadsJs,
  "/js/chat-token-utils.js": chatTokenUtilsJs,
  "/js/commit.js": commitJs,
  "/js/diff.js": diffJs,
  "/js/edit-buffer.js": editBufferJs,
  "/js/expert-utils.js": expertUtilsJs,
  "/js/help-tooltip.js": helpTooltipJs,
  "/js/notes.js": notesJs,
  "/js/patch-buffer.js": patchBufferJs,
  "/js/session-clone.js": sessionCloneJs,
  "/js/session-finder.js": sessionFinderJs,
  "/js/session-keybindings.js": sessionKeybindingsJs,
  "/js/summary-buffer.js": summaryBufferJs,
  "/js/utils.js": utilsJs,
  "/vendor/highlight/atom-one-dark.min.css": highlightCss,
  "/vendor/highlight/elixir.min.js": highlightElixirJs,
  "/vendor/highlight/highlight.min.js": highlightJs,
  "/vendor/marked.min.js": markedJs,
};

/**
 * Helper to get MIME type from file extension
 */
export function getMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    js: "application/javascript",
    css: "text/css",
    html: "text/html",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    eot: "application/vnd.ms-fontobject",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}

/**
 * Build a map of URL paths to embedded file Blobs
 * Use this to serve static assets from the compiled executable
 */
export function getEmbeddedAssets(): Map<string, Blob> {
  const assets = new Map<string, Blob>();
  for (const [urlPath, path] of Object.entries(EMBEDDED_ASSET_PATHS)) {
    assets.set(urlPath, Bun.file(path));
  }
  return assets;
}

/**
 * Check if running in a compiled executable (not development)
 */
export function isCompiled(): boolean {
  // In a compiled executable, import.meta.url starts with "file://$bunfs/"
  // In development, it's a regular file path
  return import.meta.url?.includes("$bunfs") || false;
}
