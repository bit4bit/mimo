## Context

See `proposal.md` for the motivation. The platform currently exposes two overlapping form fields on session creation:

- `agentSubpath` (repo-relative) — pre-existing, single-repo oriented.
- `relativeDir` (workspace-relative) — added by `multi-repo-projects`, generalizes to mount-path-prefixed paths.

The POST handler at `sessions.tsx:530-537` resolves them as `effectiveSubpath = agentSubpath ?? project.agentSubpath` and `effectiveRelativeDir = relativeDir ?? effectiveSubpath`. So in the common single-repo case the two fields collapse to the same value. Storage is unchanged: `session.agentSubpath` and `session.relativeDir` persist separately, and `mimo-agent` consumes `relativeDir ?? agentSubpath` for the ACP cwd.

## Goals / Non-Goals

**Goals:**
- Present a single "Working directory" input on the session creation form.
- Preserve the existing storage model (`agentSubpath`, `relativeDir`) so no data migration is needed and `mimo-agent` is untouched.
- Keep the resolution chain: session form value → project `agentSubpath` → workspace root.
- Show a single read-only row on the session settings page.

**Non-Goals:**
- Fixing the file-tree scoping bug (tracked separately by `fix-file-tree-relative-dir-scoping`).
- Merging or removing the underlying `agentSubpath` / `relativeDir` storage fields.
- Changing the project create form (it already has one field).
- Changing `mimo-agent` cwd resolution logic.

## Decisions

### Decision 1: Single form field, pass-through storage (no mount-path stripping)

The form posts one field, `workingDirectory`. The POST handler stores it as-is into both `agentSubpath` and `relativeDir` (validated/normalized). This preserves the exact pre-unification behavior: the agent uses `relativeDir ?? agentSubpath` for cwd, and both fields hold the same workspace-relative value.

No mount-path prefix stripping is performed. This is intentional — the old `agentSubpath` field was never stripped either, and stripping introduced a regression for multi-repo sessions (the agent cwd resolved against the wrong base path).

**Rationale:** Zero migration, `mimo-agent` unchanged, identical cwd resolution to before. The form is the only thing that changes.

**Alternative considered:** Derive `agentSubpath` by stripping the matched mount-path prefix. Rejected — changed the stored `agentSubpath` value for multi-repo projects, breaking the agent's cwd resolution.

### Decision 2: Placeholder and help text adapt to project shape

- Single-repo project: placeholder `packages/backend`, help text "Relative path within the repository where the agent will start."
- Multi-repo project: placeholder `<firstMountPath>/packages/app`, help text lists available mount paths (as `relativeDir` currently does).

**Rationale:** The placeholder is the single biggest cue for which coordinate system to use. Reusing the existing `relativeDir` placeholder logic keeps multi-repo guidance intact.

### Decision 3: Session settings page shows one row

Replace the two rows ("Agent working directory" and "Workspace directory") with a single "Working directory" row showing the effective value (`relativeDir ?? agentSubpath ?? "Repository root"`).

## Risks / Trade-offs

- [Users with bookmarks/scripts posting `agentSubpath` or `relativeDir` directly] → Mitigation: POST handler still accepts the legacy field names as fallbacks. If `workingDirectory` is absent but `agentSubpath`/`relativeDir` is present, use it. This keeps the API back-compatible.
- [Ambiguity when a single-repo mount path equals a real subdirectory name] → Low risk; mount-path prefix match is longest-first and only matches actual configured mount paths. Document in help text.
- [Two stored fields can drift if edited via API] → Accepted; out of scope. The UI is the contract; the API remains permissive.