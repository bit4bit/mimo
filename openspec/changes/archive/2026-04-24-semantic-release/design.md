# Design: Semantic Versioning & Cross-Platform Releases

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     RELEASE WORKFLOW                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────┐
│  1. Developer runs `bun run release`     │
│     • Updates version in package.jsons   │
│     • Creates git tag (vX.Y.Z)           │
│     • Pushes tag to origin                 │
└────────────────┬──────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. GitHub Actions triggered by tag       │
│     • Matrix build: 3 architectures       │
│     • Each job builds both packages       │
└────────────────┬──────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Build Process (per architecture)    │
│     • Embed assets via glob patterns      │
│     • Compile platform → single binary  │
│     • Compile agent → single binary     │
│     • Calculate SHA256 checksums        │
└────────────────┬──────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. GitHub Release Created              │
│     • All binaries uploaded             │
│     • Checksums included                │
│     • Release marked as draft           │
└─────────────────────────────────────────┘
```

## Build Targets

| Package        | Linux x64 | macOS x64 | macOS ARM64 |
|----------------|-----------|-----------|-------------|
| mimo-platform  | ✓         | ✓         | ✓           |
| mimo-agent     | ✓         | ✓         | ✓           |

## Asset Embedding Strategy (Native Bun)

**Bun v1.2.17+ supports native asset embedding** via `with { type: "file" }` import attribute.

### Step 1: Create Asset Loader Module

Create `src/assets.ts` that imports all public assets:

```typescript
// src/assets.ts - imports all assets to embed them
import "../public/js/chat.js" with { type: "file" };
import "../public/js/utils.js" with { type: "file" };
import "../public/vendor/highlight/highlight.min.js" with { type: "file" };
// ... all other assets

// Re-export embeddedFiles for serving
export { embeddedFiles } from "bun";
```

### Step 2: Serve Embedded Assets

Modify the platform to serve from embedded files when running as compiled executable:

```typescript
// In index.tsx or server setup
import { embeddedFiles, serve } from "bun";
import "./assets.js"; // Trigger asset embedding

// Build static routes map from embedded files
const staticRoutes: Record<string, Blob> = {};
for (const blob of embeddedFiles) {
  // Convert "$bunfs/filename-hash.ext" to "/path/filename.ext"
  const urlPath = "/" + blob.name.replace(/^\$bunfs\//, "").replace(/-[a-f0-9]+\./, ".");
  staticRoutes[urlPath] = blob;
}

// Use with Hono or Bun.serve
app.use("/js/*", async (c, next) => {
  const path = c.req.path;
  if (staticRoutes[path]) {
    const blob = staticRoutes[path];
    const contentType = getContentType(path); // helper to determine MIME type
    return new Response(blob, { headers: { "Content-Type": contentType } });
  }
  return next();
});
```

### Step 3: Build with Asset Embedding

```bash
# Include the assets.ts file which triggers embedding
bun build --compile \
  --target=bun-linux-x64 \
  ./src/index.tsx \
  ./src/assets.ts \
  --outfile ./dist/mimo-platform-linux-x64
```

**Alternative approach**: Import assets directly in entry file:

```typescript
// At top of index.tsx
import "./public/js/chat.js" with { type: "file" };
import "./public/vendor/highlight/highlight.min.js" with { type: "file" };
// ... etc
```

Then build with directory glob:

```bash
bun build --compile \
  --target=bun-linux-x64 \
  ./src/index.tsx \
  ./public/**/* \
  --outfile ./dist/mimo-platform-linux-x64
```

## File Structure Changes

```
/
├── package.json                 # Root package with shared version
├── scripts/
│   ├── bump-version.sh          # Version bump utility
│   └── release.sh               # Local release helper
├── .github/
│   └── workflows/
│       └── release.yml          # Release workflow
└── packages/
    ├── mimo-platform/
    │   └── src/
    │       └── assets.ts        # Asset embedding imports
    └── mimo-agent/
        └── package.json         # References root version
```

## Cross-Compilation Strategy

Using GitHub Actions matrix with native Bun cross-compilation:

```yaml
strategy:
  matrix:
    include:
      - os: ubuntu-latest
        target: bun-linux-x64
        suffix: linux-x64
      - os: macos-13  # Intel
        target: bun-darwin-x64
        suffix: darwin-x64
      - os: macos-14  # Apple Silicon
        target: bun-darwin-arm64
        suffix: darwin-arm64
```

Each runner builds natively for its platform, producing:
- `mimo-platform-{suffix}`
- `mimo-agent-{suffix}`

## Security Considerations

- SHA256 checksums for all binaries
- Reproducible builds (same Bun version, locked dependencies)
- No secrets in compiled binaries (env vars only)
- `BUN_OPTIONS` env var allows runtime debugging without rebuild
