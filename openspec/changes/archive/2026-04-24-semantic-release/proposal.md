# Proposal: Semantic Versioning & Cross-Platform Releases

## Overview

Implement semantic versioning with automated cross-compilation and GitHub releases for the Mimo project. This enables users to download single-file executables for their platform.

## Goals

1. Shared semantic versioning (v0.0.0) across all packages
2. Single command to bump version, tag, and trigger release
3. Cross-compilation for Linux x64, macOS x64, and macOS ARM64
4. Single-file executables **with embedded assets**
5. Automated GitHub releases with checksums

## Non-Goals

- Windows support (future consideration)
- Automated changelog generation
- Docker images

## Success Criteria

- [ ] `bun run release` bumps version, creates tag, pushes
- [ ] GitHub Actions builds 6 binaries (platform + agent × 3 architectures)
- [ ] Each binary is a single file with embedded assets
- [ ] Release includes SHA256 checksums
- [ ] AGENTS.md documents version control procedures

## Scope

### In Scope
- Root package.json with shared version
- Version bump script
- Asset embedding build step
- Cross-compilation GitHub Actions workflow
- AGENTS.md updates

### Out of Scope
- Breaking change detection
- Automated version bumping based on commits
- Release notes generation
