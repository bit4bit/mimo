## Context

`VCS.buildGitSshCommand(keyPath)` (`src/domain/vcs/index.ts:151`) returns the
`ssh` command stored in `GIT_SSH_COMMAND`. It is only constructed inside
`if (credential?.type === "ssh")` in three operations: `cloneRepository` (~733),
`pushToRemote` (~1014), and `pushUpstream` (~1248). The command always targets
the default SSH port (22). Git's scp-like URLs (`git@host:path`) cannot encode a
port, so repos behind a non-standard SSH port cannot be cloned or pushed.

Branch configuration already flows the way we want a port to flow:
`Project.sourceBranch` → `CloneParams.branch` → `cloneRepository(..., sourceBranch)`,
and at push time `commits/service.ts` computes `session.branch || project.newBranch`
with both `session` and `project` in scope. We mirror that path.

## Goals / Non-Goals

**Goals:**
- Manually set an SSH port at the project level (repo default) and override it
  per session; effective port = `session.clonePort ?? project.clonePort`.
- Inject `-p <port>` into the SSH command for git clone and git push.
- Make the SSH command build when **either** an SSH key **or** a port is present.
- Validate the port (integer, 1–65535) at the API/web boundary.

**Non-Goals:**
- Parsing the port out of `ssh://host:port/...` URLs (manual only).
- Fossil remotes (Fossil uses HTTPS; no SSH port handling).
- Per-credential port storage (port belongs to the repo/session, not the key).

## Decisions

**1. Port lives on Project (default) + Session (override), not on Credential.**
A port is a property of *where the repo lives*, not of the key used. This mirrors
`sourceBranch`/`branch` exactly, so threading is a known, low-risk pattern.
Effective value resolved at the call site: `session.clonePort ?? project.clonePort`.
*Alternative — store on Credential:* rejected; one key can serve many hosts/ports
and it muddies the credential model.

**2. `buildGitSshCommand` takes optional key AND optional port.**
New signature: `buildGitSshCommand(keyPath?: string, clonePort?: number)`.
- key only → `ssh -i "KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`
- port only → `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p PORT` (no `-i`)
- key + port → both, with `-p PORT` appended
- neither → caller does not set `GIT_SSH_COMMAND` (today's behavior)

Each of the three ops decides to build/set `GIT_SSH_COMMAND` when
`credential?.type === "ssh" || clonePort != null`, replacing the SSH-key-only gate.
*Alternative — separate `GIT_SSH_PORT` handling:* rejected; git has no such
variable, `-p` in `GIT_SSH_COMMAND` is the canonical mechanism.

**3. Validate at the boundary, store a clean integer.**
The web POST handler (`sessions.tsx`) and the API request handlers parse and
validate: must be an integer in 1–65535, else reject with a clear message. The
domain/vcs layer trusts the stored value and only checks `!= null`.
*Alternative — validate deep in vcs:* rejected; fail fast at input, keep the
domain simple.

**4. `pushToRemote` gets the param despite having no non-test caller.**
It builds the SSH command, so for consistency and future use it takes the same
optional `clonePort` argument.

## Risks / Trade-offs

- **Behavior change: SSH command now built for non-SSH-credential clones when a
  port is set.** → Only triggers when `clonePort != null`; with no port, behavior
  is byte-for-byte unchanged. Covered by tests for each gate combination.
- **Stale port after remote moves ports.** → Editable via session override and
  project update; surfaced in the create/edit forms.
- **Persistence migration (new nullable column on project + session).** →
  Nullable with no default; existing rows read as `undefined` → no port → today's
  behavior. Backward compatible.
- **Port set but URL is HTTPS.** → `-p` is harmless for HTTPS clones because
  `GIT_SSH_COMMAND` is unused by HTTPS transport; no special-casing needed.

## Migration Plan

1. Add nullable `clonePort` columns/fields to project and session persistence.
2. Ship domain + API + web changes together (field is optional end-to-end).
3. Rollback: column is nullable and unused when absent; reverting code leaves
   orphan column harmless.

## Open Questions

- None. All four scope decisions (project+session, all SSH ops, manual `-p`
  only, validate 1–65535) are locked.
