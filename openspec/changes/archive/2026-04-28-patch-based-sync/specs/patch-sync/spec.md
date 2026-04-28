## ADDED Requirements

### Requirement: System generates unified patch from agent-workspace changes
The system SHALL generate a unified diff (patch) comparing the upstream directory against the agent-workspace directory, representing all changes the agent has made.

#### Scenario: Generate patch with modified files
- **WHEN** agent-workspace contains modified files compared to upstream
- **THEN** system runs `git diff --binary --no-index -- upstream/ agent-workspace/` from the session directory
- **AND** system normalizes paths in the patch (replaces `a/upstream/` with `a/` and `b/agent-workspace/` with `b/`)
- **AND** system filters out diff hunks for VCS metadata files (`.fslckout`, `.fossil`, `_FOSSIL_`, `.fslckout-journal`)
- **AND** system returns the normalized patch content as a string

#### Scenario: Generate patch with new files
- **WHEN** agent-workspace contains files that do not exist in upstream
- **THEN** system generates a patch with "new file" entries for each new file
- **AND** patch paths are normalized to relative paths

#### Scenario: Generate patch with deleted files
- **WHEN** agent-workspace is missing files that exist in upstream
- **THEN** system generates a patch with "deleted file" entries for each missing file

#### Scenario: No changes detected
- **WHEN** upstream and agent-workspace directories are identical (excluding VCS metadata)
- **THEN** system returns an empty patch
- **AND** system reports success with "No changes" message

#### Scenario: Handle git diff exit code 1
- **WHEN** `git diff --no-index` exits with code 1
- **THEN** system treats this as success (exit code 1 means differences were found)
- **AND** system returns the generated patch content

### Requirement: System aligns workspace disk state with fossil tracking before patch generation
The system SHALL ensure the agent-workspace filesystem matches fossil's tracking state before generating patches, handling cases where `fossil rm` was used without physical file deletion.

#### Scenario: Fossil rm without physical deletion
- **WHEN** a file was removed via `fossil rm` in agent-workspace but still exists on disk
- **THEN** system runs `fossil changes` to detect DELETED files
- **AND** system physically deletes those files from disk
- **AND** subsequent patch generation correctly shows the file as deleted

#### Scenario: Fossil upstream alignment
- **WHEN** upstream is a fossil repository
- **THEN** system also runs `fossil changes` on upstream to align its disk state
- **AND** files marked DELETED in upstream fossil are physically removed before diff generation

#### Scenario: No fossil tracking mismatches
- **WHEN** all files on disk match fossil's tracking state
- **THEN** system proceeds to patch generation without modifications

### Requirement: System stores patches in session directory
The system SHALL store each generated patch as a file in the session's `patches/` directory for historical record.

#### Scenario: Store patch with timestamp
- **WHEN** a non-empty patch is generated
- **THEN** system writes the patch to `sessions/{projectId}/{sessionId}/patches/{ISO-timestamp}.patch`
- **AND** timestamp uses `-` instead of `:` for filesystem compatibility (e.g., `2026-04-10T10-30-00.000Z.patch`)
- **AND** system returns the path to the stored patch file

#### Scenario: Empty patch not stored
- **WHEN** patch generation produces an empty patch (no changes)
- **THEN** system does NOT create a patch file
- **AND** system returns success with "No changes" message

### Requirement: System applies patch to upstream repository
The system SHALL apply the generated patch to the upstream directory, supporting both git and fossil upstream repositories.

#### Scenario: Apply patch to git upstream
- **WHEN** upstream repository type is "git"
- **AND** a non-empty patch has been generated
- **THEN** system applies the patch using `git apply --binary {patchFile}` in the upstream directory

#### Scenario: Apply patch to fossil upstream
- **WHEN** upstream repository type is "fossil"
- **AND** a non-empty patch has been generated
- **THEN** system applies the patch using `patch -p1 < {patchFile}` in the upstream directory

#### Scenario: Apply patch failure
- **WHEN** patch application fails
- **THEN** system returns an error with the failure details
- **AND** the stored patch file is preserved for debugging

### Requirement: System orchestrates full patch workflow replacing file copy
The system SHALL provide a single method that orchestrates the complete patch workflow (align, generate, store, apply), replacing the previous `cleanCopyToUpstream` file copy mechanism.

#### Scenario: Successful patch workflow
- **WHEN** `generateAndApplyPatch` is called with session paths and repo type
- **THEN** system executes: alignWorkspaceWithFossil, generatePatch, storePatch, applyPatch in sequence
- **AND** returns success with the patch file path

#### Scenario: No changes workflow
- **WHEN** `generateAndApplyPatch` is called and no differences exist
- **THEN** system returns success with "No changes" message
- **AND** no patch file is created
- **AND** no apply step is executed
