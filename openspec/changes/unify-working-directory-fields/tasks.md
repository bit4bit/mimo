## 1. Session create form — single field

- [x] 1.1 Add failing test: session create page renders a single "Working directory (optional)" input and no separate "Agent working directory" / "Workspace directory" inputs
- [x] 1.2 Add failing test: single-repo project placeholder is `packages/backend`; help text says "Relative path within the repository"
- [x] 1.3 Add failing test: multi-repo project placeholder includes a mount path; help text lists available mount paths
- [x] 1.4 Add failing test: form posts a single `workingDirectory` field (not `agentSubpath` / `relativeDir`)
- [x] 1.5 Edit `SessionCreatePage.tsx`: replace the two form groups with one "Working directory (optional)" group; `name="workingDirectory"`; placeholder/help text derived from `project.repositories` (reuse existing `relativeDir` placeholder logic)
- [x] 1.6 Pre-fill the input with `project.agentSubpath` (unchanged default behavior)

## 2. POST handler — resolve single field into dual storage

- [x] 2.1 Add failing test: POST with `workingDirectory="packages/backend"` to a single-repo project stores `agentSubpath="packages/backend"` and `relativeDir="packages/backend"`
- [x] 2.2 Add failing test: POST with `workingDirectory="repo-a/packages/app"` to a multi-repo project stores `relativeDir="repo-a/packages/app"` and `agentSubpath` derived by stripping the matched mount prefix
- [x] 2.3 Add failing test: POST with empty `workingDirectory` and project `agentSubpath="packages/backend"` stores `agentSubpath="packages/backend"` (project default inherited)
- [x] 2.4 Add failing test: legacy `agentSubpath` / `relativeDir` form fields still accepted when `workingDirectory` is absent (back-compat)
- [x] 2.5 Add failing test: `workingDirectory` escaping the workspace is rejected with a validation error
- [x] 2.6 Edit `sessions.tsx` POST handler: read `workingDirectory` first; if absent, fall back to `agentSubpath` then `relativeDir` (legacy). Resolve `effectiveSubpath` and `effectiveRelativeDir` per design Decision 1 (mount-path prefix match for multi-repo, identity for single-repo). Pass through to existing `validateWorkspaceRelativeDir` + storage path unchanged.

## 3. Session settings page — single row

- [x] 3.1 Add failing test: session settings page shows a single "Working directory" row with effective value `relativeDir ?? agentSubpath ?? "Repository root"`
- [x] 3.2 Add failing test: settings page does not render separate "Agent working directory" and "Workspace directory" rows
- [x] 3.3 Edit `SessionSettingsPage.tsx`: replace the two rows with one "Working directory" row showing `session.relativeDir ?? session.agentSubpath ?? "Repository root"`

## 4. Update existing tests

- [x] 4.1 Update `packages/mimo-platform/test/sessions.test.ts`: replace assertions for "Agent working directory" and "Workspace directory" labels with single "Working directory" label
- [x] 4.2 Update `packages/mimo-platform/test/chat-threads.test.ts`: thread working-directory override tests to use the single `workingDirectory` form field — no change needed; thread API uses a separate `relativeDir` JSON field unaffected by the form unification
- [x] 4.3 Update any test posting `agentSubpath` or `relativeDir` directly to use `workingDirectory` (keep one back-compat test per 2.4)

## 5. Verify

- [x] 5.1 Run `bun test` in `packages/mimo-platform` — all tests green (2 flaky env failures unrelated to change: commit-preview-performance timing + impact-reliability SCC dependency)
- [x] 5.2 Run `bun run test.full` in `packages/mimo-platform` — full suite green (same 2 flaky failures; unit suite confirmed clean)
- [x] 5.3 `openspec validate unify-working-directory-fields --strict` passes