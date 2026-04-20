## Tasks

### UI Layer

#### Task 1: Add branchMode radio group to session creation form
**Status**: completed
**Description**: Extend the existing Branch form-group in `SessionCreatePage` with two radio buttons for `branchMode`: `new` (checked by default) and `sync`.
**Acceptance Criteria**:
- Form exposes two inputs with `name="branchMode"` and `value="new" | "sync"`.
- `new` is checked by default.
- Help text distinguishes the two modes.
- No JavaScript is added; the form remains purely server-rendered.

**Files modified**:
- `packages/mimo-platform/src/components/SessionCreatePage.tsx`

---

### Routes & Handler

#### Task 2: Parse and validate branchMode in POST /sessions
**Status**: completed
**Description**: Parse the new field and validate it against the project type and supplied branch name.
**Acceptance Criteria**:
- Missing `branchMode` defaults to `"new"`.
- Any value other than `"sync"` is coerced to `"new"`.
- `branchMode=sync` with an empty `branchName` returns HTTP 400.
- `branchMode=sync` for a fossil project returns HTTP 400.

**Files modified**:
- `packages/mimo-platform/src/sessions/routes.tsx`

#### Task 3: Branch the clone and createBranch logic by mode
**Status**: completed
**Description**: Use `branchName` as the clone's `sourceBranch` in sync mode, skip `createBranch`, and still persist `session.branch` so the push path is unchanged.
**Acceptance Criteria**:
- In `new` mode, the clone uses `project.sourceBranch`; `createBranch` fires for `branchName || project.newBranch`; `session.branch` is set only when a branch was created.
- In `sync` mode, the clone uses `branchName` as `sourceBranch`; `createBranch` is NOT called; `session.branch = branchName` is persisted.
- Clone failure path (delete session + HTTP 500) is reused without change.

**Files modified**:
- `packages/mimo-platform/src/sessions/routes.tsx`

---

### Tests

#### Task 4: Update existing branch-override tests and add sync-mode suite
**Status**: completed
**Description**: Extend `test/sessions.test.ts` to cover both modes.
**Acceptance Criteria**:
- Existing "Session Branch Override" tests pass `branchMode=new` explicitly and remain green.
- New test: sync mode passes `branchName` as the 5th arg to `cloneRepository` and does not call `createBranch`.
- New test: sync mode persists `session.branch`.
- New test: sync mode with empty `branchName` returns 400.
- New test: sync mode on a fossil project returns 400.
- New test: omitted `branchMode` defaults to new-mode behavior.
- New test: sync clone failure returns 500 and deletes the session.
- Rendered-HTML test asserts presence of `name="branchMode"`, `value="new"`, `value="sync"`.

**Files modified**:
- `packages/mimo-platform/test/sessions.test.ts`

---

## Implementation Order

1. Task 1 (UI)
2. Task 2 & 3 (Handler)
3. Task 4 (Tests)
