// assets.ts - Embed all static assets for compiled executable
// This module imports all public assets with `with { type: "file" }`
// which tells Bun to embed them in the compiled binary.
//
// Usage in index.tsx:
//   import "./assets.js";
//   import { embeddedFiles } from "bun";
//   const assets = getEmbeddedAssets(); // Helper below

// JavaScript files
import "../public/js/chat.js" with { type: "file" };
import "../public/js/chat-threads.js" with { type: "file" };
import "../public/js/chat-token-utils.js" with { type: "file" };
import "../public/js/commit.js" with { type: "file" };
import "../public/js/diff.js" with { type: "file" };
import "../public/js/edit-buffer.js" with { type: "file" };
import "../public/js/expert-utils.js" with { type: "file" };
import "../public/js/help-tooltip.js" with { type: "file" };
import "../public/js/notes.js" with { type: "file" };
import "../public/js/patch-buffer.js" with { type: "file" };
import "../public/js/session-clone.js" with { type: "file" };
import "../public/js/session-finder.js" with { type: "file" };
import "../public/js/session-keybindings.js" with { type: "file" };
import "../public/js/summary-buffer.js" with { type: "file" };
import "../public/js/utils.js" with { type: "file" };

// Vendor files
import "../public/vendor/highlight/atom-one-dark.min.css" with { type: "file" };
import "../public/vendor/highlight/elixir.min.js" with { type: "file" };
import "../public/vendor/highlight/highlight.min.js" with { type: "file" };
import "../public/vendor/marked.min.js" with { type: "file" };

// Re-export embeddedFiles from bun
export { embeddedFiles } from "bun";

const EMBEDDED_ASSET_URLS = [
  "/js/chat.js",
  "/js/chat-threads.js",
  "/js/chat-token-utils.js",
  "/js/commit.js",
  "/js/diff.js",
  "/js/edit-buffer.js",
  "/js/expert-utils.js",
  "/js/help-tooltip.js",
  "/js/notes.js",
  "/js/patch-buffer.js",
  "/js/session-clone.js",
  "/js/session-finder.js",
  "/js/session-keybindings.js",
  "/js/summary-buffer.js",
  "/js/utils.js",
  "/vendor/highlight/atom-one-dark.min.css",
  "/vendor/highlight/elixir.min.js",
  "/vendor/highlight/highlight.min.js",
  "/vendor/marked.min.js",
] as const;

const EMBEDDED_ASSET_URLS_BY_FILENAME = new Map(
  EMBEDDED_ASSET_URLS.map((urlPath) => {
    const fileName = urlPath.split("/").pop();
    return [fileName || "", urlPath];
  }),
);

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

  for (const blob of embeddedFiles) {
    const resolvedUrl = resolveEmbeddedAssetUrl(blob.name);
    if (resolvedUrl) {
      assets.set(resolvedUrl, blob);
    }
  }

  return assets;
}

export function resolveEmbeddedAssetUrl(fullName: string): string | null {
  const nameWithoutHash = fullName.replace(/-[a-f0-9]{8,}\./, ".");

  if (nameWithoutHash.includes("/public/")) {
    return nameWithoutHash.substring(
      nameWithoutHash.indexOf("/public/") + "/public".length,
    );
  }

  const fileName = nameWithoutHash.split("/").pop();
  if (!fileName) {
    return null;
  }

  return EMBEDDED_ASSET_URLS_BY_FILENAME.get(fileName) || null;
}

/**
 * Check if running in a compiled executable (not development)
 */
export function isCompiled(): boolean {
  // In a compiled executable, import.meta.url starts with "file://$bunfs/"
  // In development, it's a regular file path
  return import.meta.url?.includes("$bunfs") || false;
}
