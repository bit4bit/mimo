# Spec: Semantic Versioning & Releases

## §G Goals

1. Shared semantic versioning across monorepo packages
2. Single-command release process
3. Cross-platform single-file executables with embedded assets
4. Automated GitHub releases with checksums

## §C Constraints

- Bun v1.3.x for compilation
- GitHub Actions for CI/CD
- Linux x64, macOS x64, macOS ARM64 targets
- AGPL-3.0 license compliance

## §I Invariants

- All packages share the same version number
- Compiled binaries must include all static assets
- Releases are triggered by git tags matching `v*`
- Each release includes SHA256 checksums

## §T Test Matrix

| Test Case | Platform | Asset Embedding | Expected Result |
|-----------|----------|-----------------|-----------------|
| Build platform | Current | Yes | Single binary runs, serves UI |
| Build agent | Current | N/A | Single binary runs, connects to platform |
| Cross-compile | Linux x64 | Yes | Binary runs on Ubuntu 22.04+ |
| Cross-compile | macOS x64 | Yes | Binary runs on macOS 13+ (Intel) |
| Cross-compile | macOS ARM64 | Yes | Binary runs on macOS 14+ (Apple Silicon) |
| Version check | All | N/A | `--version` outputs correct version |

## §B Backlog

- Windows support (requires different embedding strategy)
- Automated changelog generation
- Code signing for macOS binaries
