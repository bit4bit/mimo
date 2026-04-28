## Why

Projects targeting monorepos have no way to declare where inside the repo the agent should work — users must re-specify `agentSubpath` on every session they create, which is error-prone and repetitive. Centralising this default on the project eliminates the repetition while still letting individual sessions override it.

## What Changes

- `Project` model gains an optional `agentSubpath` field (set at creation time, not editable).
- Session creation resolves the effective working directory as: explicit session override (non-empty) → project default → repo root.
- `ProjectCreatePage` exposes the new field.
- `SessionCreatePage` pre-fills `agentSubpath` from the project value; user may override or clear.

## Capabilities

### New Capabilities

- `project-working-directory`: Project-level default `agentSubpath` that sessions inherit unless explicitly overridden at creation time.

### Modified Capabilities

- `projects`: `ProjectCreatePage` gains the `agentSubpath` field.

## Impact

- `packages/mimo-platform/src/projects/repository.ts` — data model and create
- `packages/mimo-platform/src/projects/routes.tsx` — POST / handler
- `packages/mimo-platform/src/sessions/routes.tsx` — POST / resolution logic
- `packages/mimo-platform/src/components/ProjectCreatePage.tsx` — new field
- `packages/mimo-platform/src/components/SessionCreatePage.tsx` — pre-filled field
