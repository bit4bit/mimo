# AGENTS.md

This file is the instruction router for LLM agents working in this repository.

## How To Use This Guide

1. Always read `llms/core-engineering.md` first.
2. Then load only the task-relevant files from the routing table below.
3. If multiple areas apply, load multiple files.
4. When rules conflict, prefer stricter behavior (tests first, explicit dependencies, minimal safe changes).

## Routing Table

- Code design, architecture, DI, purity, env usage rules:
  - `llms/core-engineering.md`
- Commit formatting and pre-commit formatting command:
  - `llms/commits.md`
- OpenSpec lifecycle and required change-management flow:
  - `llms/workflow-openspec.md`
- ACP provider behavior, clear-session, parking, resumption, auto-commit and duplication policy:
  - `llms/acp-architecture.md`
- UI page requirements and spec references:
  - `llms/ui-standards.md`
- Test organization, test commands, and suite-health policy:
  - `llms/testing-standards.md`

## Package Setup

### Installing dependencies

Both packages use Bun. Run from each package directory:

```sh
cd packages/mimo-platform && bun install
cd packages/mimo-agent  && bun install
```

### Running tests

```sh
# unit tests
cd packages/mimo-platform && bun test
cd packages/mimo-agent  && bun test

# full suite (unit + integration)
cd packages/mimo-platform && bun run test.full
cd packages/mimo-agent  && bun run test.full
```

### Production server

**Do NOT start the production server (`bun run start` / `bun run dev`) on your own.**
If assistance with the running production environment is needed, ask the user first.

## Always-On Requirements

- BDD/TDD behavior-first workflow applies to every change.
- Do not use hidden globals or singletons.
- Keep dependencies explicit via injection.
- Keep changes minimal, clear, and behavior-driven.

## Semantic Versioning

This project uses **semantic versioning** with shared versions across all packages.

### Current Version

Check the root `package.json`:
```sh
node -p "require('./package.json').version"
```

### Versioning Rules

- **MAJOR** (X.y.z): Breaking changes that require user intervention
- **MINOR** (x.Y.z): New features, backwards compatible
- **PATCH** (x.y.Z): Bug fixes, backwards compatible

### How to Bump Version

From the repository root:

```sh
# Bump patch version (0.0.0 → 0.0.1)
./scripts/bump-version.sh patch

# Bump minor version (0.0.0 → 0.1.0)
./scripts/bump-version.sh minor

# Bump major version (0.0.0 → 1.0.0)
./scripts/bump-version.sh major

# Set specific version
./scripts/bump-version.sh 1.2.3
```

This updates:
- Root `package.json`
- `packages/mimo-platform/package.json`
- `packages/mimo-agent/package.json`

After bumping, commit the changes and create a tag:

```sh
git add -A
git commit -m "chore: bump version to 0.0.1"
git tag v0.0.1
git push origin main
git push origin v0.0.1
```

### Release Workflow

Pushing a tag starting with `v` triggers the release workflow:

1. GitHub Actions builds cross-platform binaries:
   - Linux x64
   - macOS x64 (Intel)
   - macOS ARM64 (Apple Silicon)

2. Each binary is a single-file executable with embedded assets

3. A draft GitHub Release is created with all binaries and SHA256 checksums

4. Review the draft release and publish it manually

### Release Artifacts

| Artifact | Description |
|----------|-------------|
| `mimo-platform-{platform}` | Web platform server |
| `mimo-agent-{platform}` | Agent CLI tool |
| `checksums.txt` | SHA256 checksums for verification |

### Cross-Compilation

The release workflow uses Bun's native cross-compilation:
```sh
bun build --compile --target=bun-linux-x64 ./src/index.ts --outfile myapp
```

Supported targets: `bun-linux-x64`, `bun-darwin-x64`, `bun-darwin-arm64`

### Asset Embedding

Static assets in `packages/mimo-platform/public/` are embedded in the compiled binary using Bun's native `with { type: "file" }` import attribute. The `src/assets.ts` module imports all assets, making them available via `Bun.embeddedFiles` when running as a compiled executable.
