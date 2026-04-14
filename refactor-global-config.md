# Refactor Plan: Remove global-config.ts

## What global-config.ts does

A mutable global singleton (`config.mimoHome`) with three exports:
- `setMimoHome(path)` — sets the value
- `getMimoHome()` — reads the value
- `clearConfig()` — resets to undefined

## Where it is used

### Production (`src/`)
| File | Usage |
|------|-------|
| `src/index.tsx:38` | `setMimoHome(mimoContext.env.MIMO_HOME)` after context creation |
| `src/config/paths.ts:7` | `getMimoHome() ?? join(homedir(), ".mimo")` as the mimoHome source |
| `src/impact/scc-service.ts:111,194` | `getMimoHome()` fallback in constructor and `install()` |

### Tests (37 files)
All 37 test files follow this pattern:
```ts
import { setMimoHome, clearConfig } from "../src/config/global-config.js";
beforeEach(() => { setMimoHome(testHome); });
afterEach(() => { clearConfig(); });
```

## Root cause

Module-level singletons (`userRepository`, `projectRepository`, etc.) call `getPaths()` lazily
inside their methods. `global-config` is the seam that lets tests inject a temp directory before
those lazy calls happen — without restructuring every singleton.

---

## Option B: Remove global state, pass mimoHome explicitly

### src/ changes (8 files + 1 deletion)

#### 1. `src/config/paths.ts`
Remove `getMimoHome` import. `getPaths()` defaults to `join(homedir(), ".mimo")`:
```ts
// before
import { getMimoHome as getGlobalMimoHome } from "./global-config.js";
function getMimoHome(): string { return getGlobalMimoHome() ?? join(homedir(), ".mimo"); }

// after
function getMimoHome(): string { return join(homedir(), ".mimo"); }
```

#### 2. `src/impact/scc-service.ts`
Remove `getMimoHome` import. Constructor and `install()` fall back to `getPaths()` directly:
```ts
// remove:  import { getMimoHome } from "../config/global-config.js";
// remove the globalHome branches; use getPaths() unconditionally
```

#### 3. `src/index.tsx`
Remove `setMimoHome` import and call (line 22 and 38).

#### 4. Delete `src/config/global-config.ts`

#### 5. `src/credentials/repository.ts`
Add deps injection pattern (same style as `UserRepository`):
```ts
interface CredentialRepositoryDeps { usersPath?: string; }
export class CredentialRepository {
  constructor(private deps: CredentialRepositoryDeps = {}) {}
  private getCredentialsDirPath(username: string) {
    return join(this.deps.usersPath ?? getPaths().users, username, "credentials");
  }
}
```

#### 6. `src/impact/repository.ts`
Add deps injection pattern:
```ts
interface ImpactRepositoryDeps { projectsPath?: string; }
export class ImpactRepository {
  constructor(private deps: ImpactRepositoryDeps = {}) {}
  private getImpactDir(projectId: string) {
    return join(this.deps.projectsPath ?? getPaths().projects, projectId, "impacts");
  }
}
```

#### 7. `src/context/mimo-context.ts`
Add `CredentialRepository` and `ImpactRepository` to `MimoContext.repos` and wire them in
`createMimoContext`:
```ts
repos: {
  // existing...
  credentials: CredentialRepository;  // new
  impacts: ImpactRepository;          // new
};
// in createMimoContext:
credentials: new CredentialRepository({ usersPath: paths.users }),
impacts: new ImpactRepository({ projectsPath: paths.projects }),
```

#### 8. `src/projects/routes.tsx`
Extend `ProjectsRoutesContext` to include all 4 repos used by the file:
```ts
// before
type ProjectsRoutesContext = Pick<MimoContext, "services">;

// after
type ProjectsRoutesContext = Pick<MimoContext, "services" | "repos">;

// inside createProjectsRoutes():
const projectRepository    = mimoContext?.repos?.projects     ?? defaultProjectRepository;
const sessionRepository    = mimoContext?.repos?.sessions     ?? defaultSessionRepository;
const credentialRepository = mimoContext?.repos?.credentials  ?? defaultCredentialRepository;
const impactRepository     = mimoContext?.repos?.impacts      ?? defaultImpactRepository;
```

---

### test/ changes (37 files)

#### Category A — Already use `createMimoContext` (8 files)
Just remove the redundant `setMimoHome` / `clearConfig` lines:
- `agents-context.test.ts`
- `auth-context.test.ts`
- `auth-routes-context-user-repo.test.ts`
- `projects-sessions-context.test.ts` — also replace `projectRepository` singleton with `mimoContext.repos.projects`
- `repositories-context.test.ts` — remove `setMimoHome(homeA/B)` calls inside tests
- `session-repository-context.test.ts` — remove `setMimoHome` calls inside the test body
- `sessions-context.test.ts`
- `sessions-repos-context.test.ts`

#### Category B — Pure repo/service tests, no routes (14 files)
Replace singleton imports + `setMimoHome` with `createMimoContext` + `ctx.repos.*`:

```ts
// before
setMimoHome(testHome);
const userModule = await import("../src/auth/user.ts");
userRepository = userModule.userRepository;

// after
const { createMimoContext } = await import("../src/context/mimo-context.ts");
const ctx = createMimoContext({ env: { MIMO_HOME: testHome } });
userRepository = ctx.repos.users;
```

Files: `user.test.ts`, `chat-persistence.test.ts`, `chat-streaming-state.test.ts`,
`chat-input-recovery.test.ts`, `mcp-server-repository.test.ts`, `mcp-server-service.test.ts`,
`sessions-mcp.test.ts`, `session-bootstrap.test.ts`, `agent-bootstrap-integration.test.ts`,
`agent-handoff.test.ts`, `fossil-credentials.test.ts`, `shared-fossil-server.test.ts`,
`paths.test.ts` (test paths via `ctx.paths`), `landing.test.tsx`

#### Category C — Route tests (15 files)
Replace default route export with context-injected factory:

```ts
// before
setMimoHome(testHome);
const routesModule = await import("../src/auth/routes.tsx");
authRoutes = routesModule.default;  // createAuthRoutes() with no context

// after
const ctx = createMimoContext({ env: { MIMO_HOME: testHome } });
const { createAuthRoutes } = await import("../src/auth/routes.tsx");
authRoutes = createAuthRoutes(ctx);
```

All repo operations (`userRepository.create(...)`) also switch to `ctx.repos.users.create(...)`.

Files: `auth.test.ts`, `projects.test.ts`, `sessions.test.ts`, `agents.test.ts`,
`agent-sessions.test.ts`, `frame-buffers.test.ts`, `project-sessions-link.test.ts`,
`projects-sessions-context.test.ts`, `auto-commit-routes.test.ts`,
`mcp-server-api.test.ts` (needs `mcp-servers/routes.tsx` refactored to factory),
`commits.test.ts`, `commits-bug-fix.test.ts`, `patch-sync.test.ts`,
`vcs.test.ts`, `scc-determinism.test.ts`, `impact.test.ts`

#### Special cases

**`auto-commit-routes.test.ts`**: `setMimoHome` is only used for directory setup.
Replace with `createMimoContext(...)` (which calls `ensurePaths` internally).

**`mcp-server-api.test.ts`**: Uses `import mcpServers from "../src/mcp-servers/routes.js"` which
is a pre-built singleton router (no factory). Requires `mcp-servers/routes.tsx` to be refactored
into a `createMcpServersRoutes(mimoContext?)` factory — same pattern as auth/sessions/agents.

**`scc-determinism.test.ts`**: Uses `import("../src/config/global-config.js")` dynamically inside
the test body. Replace with `SccService` constructor that accepts `customPath`.

---

## Production correctness note

After removing `setMimoHome`, module-level singletons (`userRepository`, `projectRepository`, etc.)
default to `~/.mimo`. In production, `MIMO_HOME` is typically `~/.mimo`, so this is correct.

If a user sets a custom `MIMO_HOME`, they should use context-injected routes
(`createProjectsRoutes(mimoContext)` etc.) which get the correct path from `createMimoContext`.
The legacy module-level singletons and their routes will always use `~/.mimo`.

A follow-up refactor can migrate remaining routes off module-level singletons entirely.

---

## Implementation order

1. Core `src/` changes (paths.ts, scc-service.ts, index.tsx, delete global-config.ts)
2. Add deps injection to CredentialRepository and ImpactRepository
3. Add repos to MimoContext
4. Extend ProjectsRoutesContext
5. Category A tests (trivial — remove lines)
6. Category B tests (mechanical swap)
7. Category C tests (route factory injection)
8. Special cases (mcp-server-api, scc-determinism)
