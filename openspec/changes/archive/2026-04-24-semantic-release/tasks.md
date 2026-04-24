# Tasks: Semantic Versioning & Cross-Platform Releases

## Phase 1: Setup Root Package

- [x] **Task 1.1**: Create root `package.json` with shared version
  - Add workspaces configuration
  - Include release scripts
  - AGENTS.md: document how to read current version

## Phase 2: Asset Embedding

- [x] **Task 2.1**: Create `packages/mimo-platform/src/assets.ts`
  - Import all files from `public/` with `with { type: "file" }`
  - Export helpers for serving embedded assets
  
- [x] **Task 2.2**: Update platform to serve embedded assets
  - Import assets module in `index.tsx`
  - Check if running in compiled mode
  - Serve from embedded assets or filesystem

## Phase 3: Version Management

- [x] **Task 3.1**: Create `scripts/bump-version.sh`
  - Accept version argument (patch/minor/major/specific)
  - Update all package.json files atomically

- [x] **Task 3.2**: Create `scripts/release.sh`
  - One-command release that bumps, commits, tags, and pushes

## Phase 4: CI/CD Workflow

- [x] **Task 4.1**: Create `.github/workflows/release.yml`
  - Trigger on tags matching `v*`
  - Matrix builds for 3 architectures
  - Build both platform and agent per architecture
  - Calculate SHA256 checksums

- [x] **Task 4.2**: Create release job
  - Collect artifacts from all matrix jobs
  - Create GitHub release (draft)
  - Upload all binaries and checksums

## Phase 5: Documentation

- [x] **Task 5.1**: Update `AGENTS.md`
  - Section on semantic versioning rules
  - How to bump version
  - Release procedure
  - Version compatibility notes

## Phase 6: Testing

- [ ] **Task 6.1**: Test version bump locally
  - Verify all package.json files updated
  - Verify tag created correctly

- [ ] **Task 6.2**: Test release workflow (dry-run)
  - Build binaries for current platform
  - Verify assets embedded correctly
  - Check binaries run standalone

- [ ] **Task 6.3**: Full integration test
  - Push test tag
  - Verify GitHub Actions complete
  - Download and verify binaries
