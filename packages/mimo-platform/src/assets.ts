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
    // blob.name is like "$bunfs/filename-hash.ext" or "path/filename-hash.ext"
    // We need to convert it back to the public URL path
    const fullName = blob.name;

    // Remove hash from filename if present (e.g., "chat-a1b2c3d4.js" → "chat.js")
    // The hash is a 8-char hex string before the extension
    const nameWithoutHash = fullName.replace(/-[a-f0-9]{8,}\./, ".");

    // Extract the URL path from the embedded path
    // e.g., "packages/mimo-platform/public/js/chat.js" → "/js/chat.js"
    let urlPath: string;
    if (nameWithoutHash.includes("/public/")) {
      urlPath = nameWithoutHash.substring(
        nameWithoutHash.indexOf("/public/") + "/public".length,
      );
    } else {
      // Fallback: use the basename
      const parts = nameWithoutHash.split("/");
      urlPath = "/" + parts[parts.length - 1];
    }

    assets.set(urlPath, blob);
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
