## ADDED Requirements

### Requirement: Patch generation diffs only changed files

The system SHALL generate a patch by running a diff only on files identified as changed, not over the entire workspace and upstream directories.

#### Scenario: One changed file in large repository

- **WHEN** only "src/app.js" differs between workspace and upstream
- **THEN** the patch command includes only "src/app.js"
- **AND** the command does not diff the remaining repository files

### Requirement: Patch size is bounded

The system SHALL enforce a configurable maximum patch size and abort patch generation if exceeded.

#### Scenario: Patch exceeds maximum size

- **WHEN** the generated patch exceeds the configured maximum size
- **THEN** the system stops patch generation
- **AND** returns an error indicating the patch is too large
- **AND** suggests committing in smaller chunks

### Requirement: Patch remains semantically correct for changed paths

The system SHALL produce the same logical patch for the changed subset as the previous full-directory diff would have produced for that subset.

#### Scenario: Add, modify, and delete in one patch

- **WHEN** the workspace has one added, one modified, and one deleted file
- **THEN** the patch includes all three changes
- **AND** paths are normalized to repository-relative paths

### Requirement: Maximum patch size is configurable

The system SHALL read the maximum patch size from environment configuration at startup.

#### Scenario: Environment sets patch size cap

- **WHEN** PATCH_MAX_SIZE_BYTES is set to 5MB
- **THEN** patch generation aborts if output exceeds 5MB
- **AND** the default cap is used when the variable is not set
