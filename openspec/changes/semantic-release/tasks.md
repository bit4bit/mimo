# Tasks: Semantic Versioning & Cross-Platform Releases

## Phase 1: Setup Root Package

- [ ] **Task 1.1**: Create root `package.json` with shared version
  - Add workspaces configuration
  - Include release scripts
  - AGENTS.md: document how to read current version

## Phase 2: Asset Embedding

- [ ] **Task 2.1**: Create `scripts/embed-assets.ts`
  - Scan `packages/mimo-platform/public/`
  - Generate base64-encoded asset map
  - Output to `src/assets-embedded.ts`
  
- [ ] **Task 2.2**: Create embedded asset middleware
  - Add `src/middleware/embedded-static.ts`
  - Serve from EMBEDDED_ASSETS in production
  - Fall back to filesystem in development

- [ ] **Task 2.3**: Update platform build script
  - Run embed-assets.ts before compile
  - Modify platform entry to use embedded assets when compiled

## Phase 3: Version Management

- [ ] **Task 3.1**: Create `scripts/bump-version.sh`
  - Accept version argument (patch/minor/major/specific)
  - Update all package.json files atomically
  - Create git tag
  - Push tag to trigger release

- [ ] **Task 3.2**: Add version to compiled binaries
  - Embed version string in both packages
  - Add `--version` flag to CLI output

## Phase 4: CI/CD Workflow

- [ ] **Task 4.1**: Create `.github/workflows/release.yml`
  - Trigger on tags matching `v*`
  - Matrix builds for 3 architectures
  - Build both platform and agent per architecture
  - Calculate SHA256 checksums

- [ ] **Task 4.2**: Create release job
  - Collect artifacts from all matrix jobs
  - Create GitHub release (draft)
  - Upload all binaries and checksums

## Phase 5: Documentation

- [ ] **Task 5.1**: Update `AGENTS.md`
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
