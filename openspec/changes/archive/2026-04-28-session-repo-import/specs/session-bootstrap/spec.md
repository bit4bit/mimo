## ADDED Requirements

### Requirement: Session creation clones repository to upstream

The platform SHALL clone the project's repository URL to the `upstream/` directory during session creation.

#### Scenario: Clone Git repository
- **WHEN** project has `repoType: "git"` and valid Git URL
- **THEN** platform executes `git clone <repoUrl> upstream/` in session directory
- **AND** upstream directory contains `.git` folder
- **AND** platform creates `upstream/` directory

#### Scenario: Clone Fossil repository
- **WHEN** project has `repoType: "fossil"` and valid Fossil URL
- **THEN** platform executes `fossil clone <repoUrl> upstream/.fossil` 
- **AND** platform executes `fossil open upstream/.fossil` in `upstream/` directory
- **AND** platform creates `upstream/` directory

#### Scenario: Clone failure
- **WHEN** repository clone fails (invalid URL, auth required, network error)
- **THEN** session creation returns error `CLONE_FAILED`
- **AND** session is not created
- **AND** error message includes failure reason

### Requirement: Session creation imports repository to Fossil proxy

The platform SHALL import the upstream repository into `repo.fossil` as a one-time copy.

#### Scenario: Import from Git upstream
- **WHEN** upstream is a Git repository
- **THEN** platform executes `fossil import --git upstream/.git repo.fossil`
- **AND** `repo.fossil` is created in session directory
- **AND** imported repository contains all commits from upstream

#### Scenario: Import from Fossil upstream
- **WHEN** upstream is a Fossil repository
- **THEN** platform executes `fossil clone upstream/.fossil repo.fossil`
- **AND** `repo.fossil` is created in session directory

#### Scenario: Import failure
- **WHEN** fossil import fails
- **THEN** session creation returns error `IMPORT_FAILED`
- **AND** session is not created

### Requirement: Session creation opens Fossil checkout

The platform SHALL open the Fossil repository into `checkout/` directory.

#### Scenario: Open checkout
- **WHEN** `repo.fossil` exists after import
- **THEN** platform executes `fossil open repo.fossil checkout/`
- **AND** `checkout/` directory contains working copy of all files
- **AND** session can be used for file synchronization

#### Scenario: Open failure
- **WHEN** checkout open fails
- **THEN** session creation returns error `CHECKOUT_FAILED`
- **AND** session is not created

### Requirement: Session directory structure

The platform SHALL create the complete session directory structure.

#### Scenario: Complete session structure
- **WHEN** session creation succeeds
- **THEN** session directory contains:
  - `session.yaml`: session metadata
  - `upstream/`: original repository (git or fossil)
  - `repo.fossil`: fossil proxy copy
  - `checkout/`: working copy for platform changes