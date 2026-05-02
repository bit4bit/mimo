# Design: Force Push Button

## UI Placement

Add a "Force Push" button in the session action bar (next to "Commit Changes" and "Sync Now").

```
┌────────────────────────────────────────────┐
│  [Commit Changes] [Sync Now] [Force Push]  │
│                              ⚠️ Dangerous  │
└────────────────────────────────────────────┘
```

- Style: `btn-danger` (red) to indicate destructive action
- Disabled when no upstream configured or no commits to push
- Shows tooltip: "Force push committed changes to upstream (overwrites remote history)"

## Confirmation Dialog

Clicking Force Push opens a confirmation modal:

```
┌─────────────────────────────────────────────┐
│  ⚠️ Force Push to Upstream?                │
│                                             │
│  This will overwrite remote branch history. │
│  Commits on the remote will be lost.       │
│                                             │
│  [Cancel]        [Force Push]              │
└─────────────────────────────────────────────┘
```

## API Endpoint

```
POST /commits/:sessionId/push-force

Request body: none (reads upstream state from disk)

Response:
{
  success: boolean,
  message: string,
  error?: string
}
```

## Backend Flow

1. Resolve session → project → upstream path
2. Check repo type (git/fossil)
3. Call `vcs.pushUpstream(upstreamPath, repoType, credential, branch, { force: true })`
4. Return result

## VCS Changes

Extend `pushUpstream` signature:

```typescript
async pushUpstream(
  upstreamPath: string,
  repoType: "git" | "fossil",
  credential?: Credential,
  branch?: string,
  options?: { force?: boolean }
): Promise<VCSResult>
```

For git: append `--force` to push args
For fossil: append `--force` to push command

## Error Handling

- No remote configured → success: true, message: "No remote configured"
- Auth failure → success: false, error: auth error
- Network failure → success: false, error: network error
