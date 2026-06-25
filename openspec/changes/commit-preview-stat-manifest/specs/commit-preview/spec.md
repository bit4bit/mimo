## ADDED Requirements

### Requirement: Commit preview reuses cached hashes for stat-unchanged files

The commit preview SHALL maintain, per session and per working tree (the upstream checkout and the agent workspace), a persisted manifest mapping each non-excluded file path to its `size`, modification time, and content hash. During a scan, for a file whose `size` and modification time match its manifest entry, the preview SHALL reuse the stored hash and MUST NOT read the file's content. Files absent from the manifest, or whose `size` or modification time differs, SHALL be read, re-hashed, and have their manifest entry updated. The resulting changed-file list MUST be identical to comparing the two trees by content directly.

#### Scenario: Repeated preview of an unchanged tree reads no content

- **WHEN** a preview is generated twice with no files changed between the two runs
- **THEN** the second preview reads no file content and returns the same result as the first

#### Scenario: Only changed files are re-read

- **WHEN** exactly one file's content (and therefore its size or modification time) changes between two previews
- **THEN** the second preview reads only that file's content and reports it as `modified`

#### Scenario: First preview populates the manifest

- **WHEN** a preview runs for a tree that has no existing manifest
- **THEN** every scanned file is read and hashed, and a manifest is persisted for reuse by later previews

### Requirement: Commit preview manifest is refreshed after a commit

After a successful commit changes the upstream checkout, the commit preview SHALL invalidate or refresh the upstream tree's manifest so that the next preview reflects the new upstream state rather than reusing stale cached hashes.

#### Scenario: Preview after commit reflects new upstream state

- **WHEN** files are committed into the upstream checkout and a preview is requested afterward
- **THEN** the preview reflects the post-commit upstream contents and does not list files that are now identical in both trees
