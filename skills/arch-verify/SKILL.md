---
name: arch-verify
description: Verify that code changes respect the project's architectural invariants, design rules, and subsystem boundaries. Use before and during implementation to catch violations early.
license: MIT
compatibility: Any project using this repository's architecture.
metadata:
  author: local
  version: "1.0"
---

# Architecture Verification Skill

Runs before or alongside implementation to ensure changes do not violate documented architectural rules, subsystem boundaries, or design invariants.

**Trigger**: Use this skill when:
- Reviewing a proposal, design, or diff before implementation
- A user asks "is this change architecturally sound?"
- About to merge a feature and want a quick architectural sanity-check
- A PR description mentions new modules, cross-package calls, or environment config

**Principle**: Catch violations at design time, not in code review.

---

## Verification Checklist

For every change, verify against these invariants. Score each: PASS / WARN / FAIL.

### 1. Dependency Injection & Purity

| # | Rule | How to Verify |
|---|------|---------------|
| 1.1 | **No hidden globals or singletons** | Search changed files for `new SomeClass()` used as default export, or module-level state that is not injected. |
| 1.2 | **Dependencies are injected, not imported blindly** | Constructor functions and factory signatures accept every external service they need. No hard imports of services inside business logic. |
| 1.3 | **Pure core, side effects at boundary** | Functions doing I/O (DB, HTTP, file system, WebSocket) are clearly marked or placed in boundary modules (`routes`, `handlers`, `adapters`). Domain logic is free of `await fetch`, `fs.writeFile`, etc. |
| 1.4 | **Construct at edge, pass inward** | Verify that `index.ts` (or main entry) creates services/repositories and passes them down. Inner modules do not call out to create their own dependencies. |

### 2. Environment Variable Hygiene

| # | Rule | How to Verify |
|---|------|---------------|
| 2.1 | **`process.env` only in `index.ts`** | Run `rg "process\.env"` on the diff. Any hit outside `packages/*/src/index.ts` or `index.tsx` is a violation. |
| 2.2 | **Values validated at boundary** | Check that env vars are parsed, defaulted, and typed before being injected. No raw `process.env.FOO` floating into services unvalidated. |

### 3. Code Design (Kent Beck's Rules Applied)

| # | Rule | How to Verify |
|---|------|---------------|
| 3.1 | **No duplication (DRY)** | If the change introduces logic that already exists elsewhere, is it extracted/shared rather than copy-pasted? |
| 3.2 | **Reveals intention** | New function/class names describe *what* from the caller's perspective, not *how*. No cryptic abbreviations or implementation-leaking names. |
| 3.3 | **Fewest elements** | The change does not add unnecessary abstractions, wrappers, or indirection. When in doubt, simpler wins. |
| 3.4 | **Composition over inheritance** | Prefer combining small functions/objects over subclassing. |

### 4. Testing Standards

| # | Rule | How to Verify |
|---|------|---------------|
| 4.1 | **Tests written first (BDD)** | For every new behavior, is there a failing test *before* implementation? Look for `test/` or `integration-test/` additions in the same commit/PR. |
| 4.2 | **Tests describe behavior, not internals** | No assertions on private variables or internal state. Assertions verify observable outcomes (HTTP status, DB state, returned values). |
| 4.3 | **Unit vs Integration placement** | Fast, isolated logic → `test/`. Spawning external processes / cross-system workflow → `integration-test/`. |
| 4.4 | **No test of HTML/component internals in platform** | UI tests verify HTTP endpoints and behavior, not DOM structure. |

### 5. Package & Module Boundaries

| # | Rule | How to Verify |
|---|------|---------------|
| 5.1 | **Two packages: `mimo-platform` and `mimo-agent`** | `mimo-platform` = Hono server, routes, UI, sync, sessions, auth, auto-commit, impact, VCS. `mimo-agent` = agent process, ACP providers, lifecycle, session manager. No cross-package imports violating this split. |
| 5.2 | **Platform responsibilities** | HTTP routes, WebSocket broadcasting, session CRUD, project management, credential storage, VCS operations, impact analysis, auto-commit orchestration. |
| 5.3 | **Agent responsibilities** | ACP client lifecycle, provider abstraction (opencode, claude-agent-acp), file watching, prompt queuing, session state machine (ACTIVE/PARKED/WAKING), sync delegation back to platform. |
| 5.4 | **Cross-package communication** | Only via WebSocket API and HTTP. No direct file imports from `mimo-platform` into `mimo-agent` or vice versa. |

### 6. UI Page Standards

| # | Rule | How to Verify |
|---|------|---------------|
| 6.1 | **Reuse existing pages over creating new** | Before adding a new page, verify if an existing page already covers the use case. Refactor and extend existing pages instead of duplicating layouts, forms, or list structures. |
| 6.2 | **Reuse logic from existing pages** | Extract shared components, handlers, or utilities from existing pages rather than duplicating form logic, validation, or rendering patterns. Shared logic belongs in `src/components/` or domain-specific helpers, not copy-pasted between pages. |
| 6.3 | **Uses `Layout` with correct title** | Every retained or refactored page extends `Layout` and sets a title. |
| 6.4 | **Max-width containers** | List/detail = 800px, forms = 400px. |
| 6.5 | **Forms use `method="post"`, include Cancel + Submit, validation errors in `.error-message` and help text in `.form-help`**. |
| 6.6 | **Keybindings checked against `docs/KEYBINDINGS.md`** | New shortcuts use `Mod+Shift` namespace where possible, no collisions with browser defaults without justification. |

### 7. ACP / Session Architecture (if applicable)

| # | Rule | How to Verify |
|---|------|---------------|
| 7.1 | **Provider abstraction** | New provider integrations implement the `IAcpProvider` interface; no provider-specific logic leaks into `MimoAgent` or session management. |
| 7.2 | **Session state machine respected** | ACTIVE -> PARKED -> WAKING transitions handled via `SessionLifecycleManager`. No ad-hoc state mutations bypassing the lifecycle manager. |
| 7.3 | **Duplication detection thresholds honored** | Warning 15%, block 30% in changed files (`AutoCommitService`). |

---

## Verification Report Template

After checking a change, output a concise report:

```
## Architecture Verification Report

**Change**: <name or PR title>
**Scope**: <files or modules touched>

### Scores
| Category | Score | Notes |
|----------|-------|-------|
| DI & Purity | PASS / WARN / FAIL | ... |
| Env Hygiene | PASS / WARN / FAIL | ... |
| Code Design | PASS / WARN / FAIL | ... |
| Testing | PASS / WARN / FAIL | ... |
| Package Boundaries | PASS / WARN / FAIL | ... |
| UI Standards | PASS / WARN / FAIL | ... |
| ACP / Session | PASS / WARN / FAIL | ... |

### Summary
- **Critical violations** (FAIL): <list>
- **Warnings** (WARN): <list>
- **Clean** (PASS): <list>

### Recommendations
1. <action item>
2. <action item>
```

---

## Quick Commands (for the agent to run)

When verifying, run these in parallel where possible:

```bash
# 1. Env leakage check
cd /home/bit4bit/src/mimo && rg "process\.env" --type ts --type tsx -l | grep -v 'src/index\.tsx\?$'

# 2. Singleton / global state smell
cd /home/bit4bit/src/mimo && rg "new .*\(\)(?=\s*$)" --type ts --type tsx -B1 -A1

# 3. Test coverage check (are tests in the PR?)
cd /home/bit4bit/src/mimo && git diff --name-only | grep -E 'test|spec'

# 4. Cross-package import violations
cd /home/bit4bit/src/mimo/packages/mimo-agent && rg "from.*mimo-platform" --type ts
cd /home/bit4bit/src/mimo/packages/mimo-platform && rg "from.*mimo-agent" --type ts

# 5. UI duplication check — same component logic copy-pasted?
cd /home/bit4bit/src/mimo/packages/mimo-platform/src && rg "class=\"btn\"|class=\"form-group\"|\.error-message" --type tsx -c | sort -rn
```

---

## Decision Flow

```
User asks about a change
        │
        ▼
┌─────────────────────┐
│ Is this a NEW       │
│ feature/module?     │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
   YES          NO
     │           │
     ▼           ▼
┌──────────┐  ┌──────────────────┐
│ Verify   │  │ Is the change    │
│ all 7    │  │ localized to     │
│ sections │  │ one subsystem?   │
│          │  └────────┬─────────┘
└──────────┘           │
                       ▼
                  ┌─────┴─────┐
                  ▼           ▼
                YES          NO
                 │           │
                 ▼           ▼
            ┌────────┐   ┌──────────┐
            │ Focused│   │ Verify   │
            │ sections│  │ all 7    │
            │ only    │  │ sections │
            └────────┘   └──────────┘
```

---

## Notes

- **WARN** means "flag for attention but not a blocker." Use judgment.
- **FAIL** means "fix before proceeding." Do not let it through.
- When in conflict, prefer stricter behavior: tests first, explicit deps, minimal safe changes.
- This skill is advisory; the user has final say. Present findings, don't gatekeep.
