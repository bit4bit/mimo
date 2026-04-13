# Design: Commit Modal Change Tree and Selective Apply

## Context

Today, clicking Commit opens a small modal that only accepts a message and then executes a full patch apply + commit + push flow. There is no in-modal review surface, no path-level selection, and no way to apply only Added/Modified/Deleted subsets.

The platform already has:
- Patch generation (`git diff --binary --no-index`) and patch normalization/filtering
- A modal entry point for commit actions
- A single commit endpoint that currently applies all changes

## Goals / Non-Goals

**Goals:**
- Add a preview model that returns changed files as a directory tree
- Support file-level statuses: `added`, `modified`, `deleted`
- Support directory selection with tri-state parent checkboxes
- Support expandable unified diff preview for modified files
- Make the change tree scrollable independently of modal actions
- Enforce required commit message (non-empty after trim)
- Apply only selected files/statuses in commit pipeline

**Non-Goals:**
- Line-level staging/cherry-pick within a single file
- Full side-by-side diff renderer
- Rename detection semantics in v1 (rename may appear as delete+add)

## Decisions

### Decision: File-level selection only
**Choice:** Selection is performed per file path and status class, not per hunk/line.

**Rationale:** Keeps behavior predictable, avoids complexity in partial-hunk patch rewrites, and satisfies the requested scope.

### Decision: Patch-driven preview
**Choice:** Build preview from generated unified patch metadata rather than impact metrics.

**Rationale:** Decouples commit selection use case from impact analytics and keeps commit preview aligned with actual apply semantics.

### Decision: Directory tri-state selection
**Choice:** Parent directories use checked/unchecked/indeterminate states based on descendants.

**Rationale:** Fast bulk selection for large trees while preserving explicit file-level resolution at submit time.

### Decision: Scrollable tree region
**Choice:** Tree panel gets a fixed max-height with `overflow-y: auto`; message and action row remain visible.

**Rationale:** Supports large change sets and preserves action visibility.

### Decision: Mandatory commit message and selection
**Choice:** Disable Commit & Push unless:
1) commit message is non-empty after trim
2) at least one file is selected

**Rationale:** Prevents accidental empty-message or no-op submissions.

## Data Flow

1. User opens Commit modal
2. Frontend requests preview endpoint (`/commits/:sessionId/preview`)
3. Backend generates patch and parses files/hunks into tree metadata
4. Frontend renders filters + tree + expandable modified diffs
5. User updates selections (file/folder/status)
6. User enters message
7. Frontend submits `{ message, selectedPaths, applyStatuses }` to commit endpoint
8. Backend filters patch to selected file set and applies
9. Existing commit + push flow continues

## API Shape (Proposed)

### GET `/commits/:sessionId/preview`
Returns:
- `summary`: counts by status
- `files`: flat file list with status
- `tree`: directory tree nodes for rendering
- `diffs`: hunks for modified files

### POST `/commits/:sessionId/commit-and-push`
Request body extends to include:
- `message: string` (required)
- `selectedPaths: string[]`
- `applyStatuses?: { added: boolean; modified: boolean; deleted: boolean }`

## Risks / Trade-offs

- **Large patches in modal**
  - Mitigation: lazy-render expanded hunks and cap initial lines per file if needed
- **Patch parsing edge cases (binary, rename, mode-only changes)**
  - Mitigation: explicit fallback labels and integration tests for edge patterns
- **Selection mismatch between UI and apply layer**
  - Mitigation: backend validates selected paths against preview-generated files

## Open Questions

1. Should binary modified files be expandable with metadata-only preview, or non-expandable?
2. Should status filters hide non-matching files or only toggle selection defaults?
3. Should selection persist if modal closes and reopens within the same page lifecycle?
