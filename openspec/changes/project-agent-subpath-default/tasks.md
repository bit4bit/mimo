## 1. Data Model

- [x] 1.1 Add `agentSubpath?: string` to `Project`, `PublicProject`, `ProjectData`, and `CreateProjectInput` interfaces in `projects/repository.ts`
- [x] 1.2 Persist `agentSubpath` in `ProjectRepository.create()` using the same conditional spread pattern as `sourceBranch`

## 2. Project Creation Route

- [x] 2.1 Write a failing test: creating a project with `agentSubpath` stores the value and sessions inherit it
- [x] 2.2 Read `agentSubpath` from POST body in `projects/routes.tsx` (trim, `|| undefined`)
- [x] 2.3 Pass `agentSubpath` to `projectRepository.create()`

## 3. Session Creation Resolution

- [x] 3.1 Write a failing test: session creation with empty `agentSubpath` inherits from project
- [x] 3.2 Write a failing test: session creation with non-empty `agentSubpath` overrides project default
- [x] 3.3 Resolve effective subpath in `sessions/routes.tsx`: `(agentSubpath?.trim() || undefined) ?? project.agentSubpath ?? undefined`
- [x] 3.4 Pass resolved value to `sessionRepository.create()`

## 4. UI — ProjectCreatePage

- [x] 4.1 Add optional `agentSubpath` text input to `ProjectCreatePage.tsx` with placeholder "packages/backend" and appropriate help text

## 5. UI — SessionCreatePage

- [x] 5.1 Add `agentSubpath?: string` to the local `Project` interface in `SessionCreatePage.tsx`
- [x] 5.2 Pre-fill the `agentSubpath` input with `value={project.agentSubpath ?? ""}` so the project default is shown and remains overridable
