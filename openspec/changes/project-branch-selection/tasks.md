## Tasks

### Database & Model Layer

#### Task 1: Extend Project model with branch fields
**Status**: completed
**Description**: Add `sourceBranch` and `newBranch` fields to Project model in repository.ts
**Acceptance Criteria**:
- Project interface includes optional `sourceBranch?: string`
- Project interface includes optional `newBranch?: string`
- CreateProjectInput interface includes branch fields
- ProjectData interface includes branch fields
- create() method stores branch fields in project.yaml
- findById() returns branch fields
- listByOwner() returns branch fields

**Files to modify**:
- `packages/mimo-platform/src/projects/repository.ts`

---

### VCS Layer

#### Task 2: Add cloneRepository with branch support
**Status**: completed
**Description**: Update cloneRepository method to accept optional sourceBranch parameter
**Acceptance Criteria**:
- cloneRepository accepts optional `sourceBranch?: string` parameter
- For Git: use `--branch <sourceBranch>` flag when cloning if sourceBranch provided
- For Fossil: clone full repo, then checkout sourceBranch if provided
- Existing behavior preserved when sourceBranch not provided

**Files to modify**:
- `packages/mimo-platform/src/vcs/index.ts`

#### Task 3: Add createBranch method
**Status**: completed
**Description**: Add method to create a new branch in upstream directory
**Acceptance Criteria**:
- createBranch(branchName: string, repoType: "git" | "fossil", upstreamPath: string) method exists
- For Git: executes `git checkout -b <branchName>` (overwrites if exists)
- For Fossil: executes `fossil branch new <branchName> current`
- Returns VCSResult with success/error
- Handles branch already exists gracefully (Git: -B flag, Fossil: updates automatically)

**Files to modify**:
- `packages/mimo-platform/src/vcs/index.ts`

---

### Session Initialization

#### Task 4: Update session creation with branch handling
**Status**: completed
**Description**: Modify session creation to clone from sourceBranch and create newBranch
**Acceptance Criteria**:
- Read project.sourceBranch and project.newBranch when creating session
- Pass sourceBranch to vcs.cloneRepository() if specified
- After successful clone/import, call vcs.createBranch() if newBranch specified
- Only create branch after Fossil import is complete
- Handle errors appropriately (delete session on failure)

**Files to modify**:
- `packages/mimo-platform/src/sessions/routes.tsx`

---

### UI Layer

#### Task 5: Add branch fields to project creation form
**Status**: completed
**Description**: Extend ProjectCreatePage with sourceBranch and newBranch fields
**Acceptance Criteria**:
- Form includes optional "Source Branch" text input
- Source branch field has help text: "Leave empty to use repository default branch"
- Form includes optional "New Branch" text input
- New branch field has help text: "Create a dedicated branch for AI sessions"
- Both fields are optional (can be empty)
- Fields are styled consistently with other form fields
- Form submits branch values with other project data

**Files to modify**:
- `packages/mimo-platform/src/components/ProjectCreatePage.tsx`

#### Task 6: Display branch info in project detail
**Status**: completed
**Description**: Show sourceBranch and newBranch in ProjectDetailPage
**Acceptance Criteria**:
- If project has sourceBranch, display "Source Branch: <branch>" in project details
- If project has newBranch, display "Working Branch: <branch>" in project details
- If no branches configured, display nothing (backwards compatible)
- Branch names are displayed as read-only text

**Files to modify**:
- `packages/mimo-platform/src/components/ProjectDetailPage.tsx`

#### Task 7: Exclude branch fields from edit form
**Status**: completed
**Description**: Ensure branch fields are NOT in ProjectEditPage
**Acceptance Criteria**:
- ProjectEditPage does NOT include sourceBranch or newBranch fields
- Existing branch configuration remains unchanged when editing
- Form submission does not clear branch fields

**Files to verify**:
- `packages/mimo-platform/src/components/ProjectEditPage.tsx`

---

### Routes & Validation

#### Task 8: Handle branch fields in project creation endpoint
**Status**: completed
**Description**: Update POST /projects to accept and store branch fields
**Acceptance Criteria**:
- Routes parse sourceBranch and newBranch from form data
- Branch fields are optional (no validation errors if missing)
- Branch values passed to projectRepository.create()
- No additional validation on branch names

**Files to modify**:
- `packages/mimo-platform/src/projects/routes.tsx`

---

### Tests

#### Task 9: Add project creation tests with branches
**Status**: completed
**Description**: Write tests for project creation with branch fields
**Acceptance Criteria**:
- Test creating project with sourceBranch only
- Test creating project with newBranch only
- Test creating project with both branches
- Test creating project without branches (backwards compatibility)
- Test that branch fields are stored and retrieved correctly

**Files to modify**:
- `packages/mimo-platform/test/projects.test.ts`

#### Task 10: Add VCS branch operation tests
**Status**: completed
**Description**: Write tests for VCS branch operations
**Acceptance Criteria**:
- Test cloneRepository with sourceBranch for Git
- Test cloneRepository without sourceBranch (existing behavior)
- Test createBranch for Git (creates branch, overwrites if exists)
- Test createBranch for Fossil

**Files to modify**:
- `packages/mimo-platform/test/vcs.test.ts` (create if doesn't exist)

---

## Implementation Order

1. Task 1 (Model layer - foundation)
2. Task 2 & 3 (VCS layer - core functionality)
3. Task 4 (Session integration)
4. Task 5, 6, 7 (UI layer)
5. Task 8 (Routes integration)
6. Task 9 & 10 (Tests)
