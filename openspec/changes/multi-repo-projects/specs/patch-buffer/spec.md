## MODIFIED Requirements

### Requirement: PB5 Loading Patch Content

When a patch tab is activated, PatchBuffer SHALL load original and patched content using repo-qualified paths.

#### Scenario: Load patch content for repository file

- **WHEN** a patch tab is activated for repository "backend" and path "src/utils/helpers.ts"
- **THEN** PatchBuffer requests original and patched content with that repository identity
- **AND** computes and renders the diff

### Requirement: PB6 Approve

When the user clicks "✓ Approve", PatchBuffer SHALL approve the patch into the matching repository worktree.

#### Scenario: Approve repo-qualified patch

- **WHEN** the user approves a patch for repository "frontend" and path "src/App.tsx"
- **THEN** the server writes the patched content to that repository file
- **AND** deletes the patch file
- **AND** closes the tab

### Requirement: PB8 Programmatic API

PatchBuffer SHALL expose a global API that accepts repo-qualified patch targets.

#### Scenario: Add patch programmatically

- **WHEN** `window.MIMO_PATCH_BUFFER.addPatch()` is called with `{ sessionId, repoId, originalPath, patchPath }`
- **THEN** PatchBuffer opens or updates a tab for that repository file

## ADDED Requirements

### Requirement: Patch identity includes repository

The system SHALL store and transport patch metadata with `repoId` and repo-relative paths so patches in different repositories do not collide.

#### Scenario: Same path in two repositories

- **WHEN** patches exist for `src/index.ts` in repositories "backend" and "frontend"
- **THEN** the system treats them as distinct patches
- **AND** each patch tab displays its repository name
