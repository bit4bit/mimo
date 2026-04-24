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
│  2. GitHub Actions triggered by tag     │
│     • Matrix build: 3 architectures     │
│     • Each job builds both packages       │
└────────────────┬──────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Build Process (per architecture)    │
│     • Embed assets → TypeScript module  │
│     • Compile platform → single binary  │
│     • Compile agent → single binary     │
│     • Calculate SHA256 checksums        │
└────────────────┬──────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. GitHub Release Created              │
│     • All binaries uploaded             │
│     • Checksums included                 │
│     • Release marked as draft             │
└─────────────────────────────────────────┘
```

## Build Targets

| Package        | Linux x64 | macOS x64 | macOS ARM64 |
|----------------|-----------|-----------|-------------|
| mimo-platform  | ✓         | ✓         | ✓           |
| mimo-agent     | ✓         | ✓         | ✓           |

## Asset Embedding Strategy

**Problem:** Bun's `--compile` doesn't automatically bundle filesystem assets.

**Solution:** Create a build-time script that:
1. Reads all files from `packages/mimo-platform/public/`
2. Generates `packages/mimo-platform/src/assets-embedded.ts`
3. Exports a virtual filesystem map: `path → content`
4. Replace `serveStatic` with embedded asset handler in production builds

```typescript
// Generated: src/assets-embedded.ts
export const EMBEDDED_ASSETS = {
  "/js/chat.js": "/* base64-encoded content */",
  "/vendor/highlight/highlight.min.js": "/* base64-encoded content */",
  // ... all assets
};

export function getEmbeddedAsset(path: string): Uint8Array | null {
  const base64 = EMBEDDED_ASSETS[path];
  return base64 ? Uint8Array.from(Buffer.from(base64, 'base64')) : null;
}
```

## File Structure Changes

```
/
├── package.json                 # Root package with shared version
├── scripts/
│   ├── bump-version.sh          # Version bump utility
│   └── embed-assets.ts          # Asset embedding script
├── .github/
│   └── workflows/
│       └── release.yml            # Release workflow
└── packages/
    ├── mimo-platform/
    │   └── src/
    │       └── assets-embedded.ts # Generated (gitignored)
    └── mimo-agent/
        └── package.json          # References root version
```

## Version Synchronization

Root `package.json` is the source of truth:

```json
{
  "name": "mimo",
  "version": "0.0.0",
  "private": true,
  "workspaces": ["packages/*"]
}
```

Both sub-packages will have:
```json
{
  "name": "mimo-platform",
  "version": "0.0.0"
}
```

The `bump-version.sh` script updates all three files atomically.

## Cross-Compilation Strategy

Using GitHub Actions matrix with `ubuntu-latest`, `macos-13` (Intel), and `macos-14` (Apple Silicon):

```yaml
strategy:
  matrix:
    include:
      - os: ubuntu-latest
        target: linux-x64
        platform: linux
        arch: x64
      - os: macos-13
        target: darwin-x64
        platform: darwin
        arch: x64
      - os: macos-14
        target: darwin-arm64
        platform: darwin
        arch: arm64
```

Bun's `--compile` produces native binaries for the current platform. We need to:
1. Build platform-specific binaries on each runner
2. Upload artifacts
3. Create release from a single job that collects all artifacts

## Security Considerations

- SHA256 checksums for all binaries
- Reproducible builds (same Bun version, locked dependencies)
- No secrets in compiled binaries (env vars only)
