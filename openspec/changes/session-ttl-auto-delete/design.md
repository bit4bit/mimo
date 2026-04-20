## Context

Current session delete path exists in route handler (`POST /sessions/:id/delete`).
Cleanup already includes repo/session files + in-memory/session-sync/impact/agent notifications.
Current idle timeout parks ACP runtime; it does not delete session data.
Need new retention layer independent from parking.

## Goals / Non-Goals

**Goals:**
- TTL configured in days.
- default 180 days for new + legacy sessions.
- sweeper cadence fixed to 10 minutes.
- auto-delete only when session inactive.
- manual and auto delete share one cleanup use-case.
- UI delete button shown only for inactive sessions.

**Non-Goals:**
- deleting active sessions automatically.
- changing ACP parking semantics (`idleTimeoutMs`).
- per-project retention policy.

## Decisions

### D1: Data model fields

**Decision**
- Add `sessionTtlDays: number`.
- Add `lastActivityAt: string | null` (ISO8601).
- Defaults on read/write:
  - `sessionTtlDays ?? 180`
  - `lastActivityAt ?? null`

**Rationale**
Days match product ask.
ISO string keeps YAML simple and comparable.

### D2: Expiry + inactivity predicates

**Decision**
- `expired` when `now >= createdAt + sessionTtlDays*24h`.
- `inactive` when:
  - `lastActivityAt == null`, or
  - `now - lastActivityAt >= 10 minutes`.
- Auto-delete requires both: `expired && inactive`.

**Rationale**
Prevents destructive delete during active usage windows.

### D3: Activity signal source

**Decision**
Update `lastActivityAt` on externally visible session activity:
- user sends message
- assistant stream/thought/usage event arrives
- other session interaction events already routed through platform chat/session handlers

**Rationale**
Retention safety must use real interaction signals, not ACP internal state only.

### D4: Shared delete use-case

**Decision**
Extract delete workflow into single function/service used by:
- manual route `POST /sessions/:id/delete`
- TTL sweeper

Function must preserve current behavior parity:
1. repository delete
2. clear session state
3. sync cleanup
4. impact cleanup
5. notify assigned agent (`session_ended`)

**Rationale**
No cleanup drift between manual and automatic delete paths.

### D5: Sweeper execution model

**Decision**
- Run periodic sweep every 10 minutes from platform process.
- For each session: evaluate predicates, then delete via shared use-case.
- Per-session try/catch; continue loop on errors.

**Rationale**
Simple + deterministic cadence; robust against one bad session record.

### D6: UI behavior

**Decision**
- `Session Settings`: edit `sessionTtlDays` runtime setting.
- `Session Detail`: render Delete button only when inactive predicate true.

**Rationale**
Align UX with auto-delete safety rule.

## Risks / Trade-offs

- **Clock drift / restart gaps**: sweep is periodic, not real-time. delete may happen up to <10m late.
- **False activity gaps**: if activity event not wired, session may look inactive. Mitigation: central helper + tests over event matrix.
- **Legacy sessions**: old YAML lacks new fields. Mitigation: backward defaults on deserialize.
