## Context

See proposal.md - Why. The current implementation (archived change `session-branch-mode`, now merged into `openspec/specs/session-bootstrap/spec.md`) resolves `branchMode`/`branchName` once per POST and applies them to every repo. The mode decision already executes inside the per-repo loop in `sessions.tsx` (≈ lines 669–744), and per-repo branch persistence (`SessionRepositoryEntry.branch`) plus per-repo push targeting (`commits/service.ts` line 213) already exist. The work is concentrated in the form, the POST parsing/validation, and the loop's variable sourcing.

## Goals / Non-Goals

**Goals:**

- Per-repository branch mode (`new` | `sync`) and branch name at session creation, for single- and multi-repo projects alike.
- One parsing path in the POST handler (per-repo fields + flat fallback), no behavioral change to clone/createBranch/push mechanics.
- Errors and validation failures attribute the specific repository.

**Non-Goals:**

- Fossil sync support (still rejected, now per repo).
- Persisting branch mode on the session (only the resolved branch is durable).
- Changing `SessionRepoMountInput` / internal REST API shape (mode resolution stays in the web route).
- Changing agent-side behavior.
- A session-level "apply to all" convenience UI on top of the cards (can be added later without spec changes).

## Decisions

### 1. Cards always, including single-repo projects

The form renders one branch card per project repository, unconditionally.

- **Why**: one rendering path and one parsing path; mirrors the established `RepositoryPicker` card pattern (`sourceBranch_<id>`, `newBranch_<id>`). A special single-repo layout (today's flat Branch field) would double the render/parse/test matrix for marginal UX gain.
- **Alternative considered**: keep today's flat field for single-repo projects and cards only for multi-repo — rejected (two code paths, two test suites, subtle divergence risk).

### 2. Field naming: `branchMode_<repoId>` / `branchName_<repoId>`, flat fields as fallback

- **Why**: matches the `RepositoryPicker` convention; form posts stay flat strings (no JS framework on this page).
- Resolution order per repo: `body["branchMode_<repoId>"] ?? body.branchMode ?? "new"`; branch name analogously, with `"new"`-mode empty falling back to the repository's configured `newBranch` (today's server behavior; the session-name slug is auto-filled client-side by the form, not the server).
- **Alternative considered**: nested/serialized field naming (`repos[i].branchMode`) — rejected; inconsistent with the codebase's flat `_<id>` convention and complicates form parsing.

### 3. One branch input per card whose meaning flips with the mode radio

Each card has a single text input; the mode radio selects semantics (create vs sync). A small inline script updates the label/placeholder and disables auto-slugify for cards in sync mode.

- **Why**: showing two inputs (one per mode) is ambiguous about which applies; the page already ships inline scripts, so a small per-card script is stylistically consistent.
- **Alternative considered**: two inputs per card, server uses the one matching the mode — rejected (ambiguity, cluttered UI).

### 4. Auto-slugify fans out per card, and stops on sync

Typing the session name slugifies into every card's input that (a) is in `new` mode and (b) has not been manually edited. `?branchName=` prefill seeds all cards and counts as manually edited (today's prefill semantics).

- **Why**: preserves the existing auto-name convenience for the dominant "new branch everywhere" flow; a remote branch named after a brand-new session slug is unlikely in sync mode, so auto-filling there would produce wrong values.

### 5. Mode resolution stays in the web route; internal API unchanged

The POST handler resolves per-repo mode/name and continues to drive `vcs.cloneRepository` / `vcs.createBranch` directly, persisting only the resolved branch per repo. `SessionRepoMountInput` gains no `branchMode` field.

- **Why**: consistent with the `session-branch-mode` design (mode is a creation-time UI concern, not durable state); avoids an API/versioning ripple for a field nothing else consumes.
- **Alternative considered**: extend `SessionRepoMountInput` with `branchMode` and resolve in the internal handler — rejected; pushes UI concern into the domain and creates a second resolution site.

### 6. Fossil rejection and error attribution are per repo

Sync on a fossil repo → 400 naming the repo; empty branch name in sync mode → 400 naming the repo; sync clone failure → 500 whose message prefixes the repo name, reusing the existing delete-session cleanup.

## Risks / Trade-offs

- [Partial failure mid-loop: earlier repos cloned, later repo's sync fails] → Existing cleanup deletes the whole session record and its directories; error message names the failing repo so the user can correct and resubmit.
- [Flat-fallback + per-repo fields posted simultaneously] → Per-repo field wins; fallback only applies when the suffixed field is absent (documented in spec scenario).
- [Mixed-mode session where a `new`-mode repo and a `sync`-mode repo share a branch name by coincidence] → Harmless; branches are per-repo clones, and push targets each repo's own resolved branch.
- [Heavier form for single-repo projects] → Accepted trade-off of Decision 1; the card for one repo is visually close to today's field.

## Migration Plan

Pure UI/route change; no data migration. Existing sessions are unaffected (their per-repo `branch` values are already persisted). Deploy is safe to roll back: reverting restores the session-level form, and any session created under per-repo mode still has valid persisted branches.
