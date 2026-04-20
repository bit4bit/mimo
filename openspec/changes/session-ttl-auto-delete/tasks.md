## 1. Add behavior tests first

- [x] 1.1 Add failing test: new session defaults to `sessionTtlDays: 180` and `lastActivityAt: null`
- [x] 1.2 Add failing test: repository deserialization applies defaults for legacy session files missing both fields
- [x] 1.3 Add failing test: config update accepts valid `sessionTtlDays` (days)
- [x] 1.4 Add failing test: config update rejects invalid `sessionTtlDays` (`<1`, non-integer)
- [x] 1.5 Add failing test: TTL sweeper deletes session when `expired && inactive`
- [x] 1.6 Add failing test: TTL sweeper skips session when expired but active within last 10 minutes
- [ ] 1.7 Add failing test: manual route delete and sweeper delete call same shared delete use-case
- [x] 1.8 Add failing test: session detail hides Delete button when active and shows when inactive

## 2. Implement storage + config

- [x] 2.1 Extend `Session`/`SessionData` with `sessionTtlDays` and `lastActivityAt`
- [x] 2.2 Persist defaults at create + deserialize with backward compatibility
- [x] 2.3 Extend session config update path to support `sessionTtlDays` validation and persistence
- [x] 2.4 Support setting `sessionTtlDays` during session creation (form + route + persistence)

## 3. Implement activity tracking

- [x] 3.1 Add helper to update `lastActivityAt` for session
- [x] 3.2 Wire helper into user-message + assistant stream/thought/usage event handlers

## 4. Implement shared delete use-case + sweeper

- [x] 4.1 Extract shared session delete workflow from route into reusable use-case/service
- [x] 4.2 Add TTL sweeper module: evaluate `expired && inactive` and call shared delete
- [x] 4.3 Schedule sweeper every 10 minutes in platform startup
- [x] 4.4 Add robust logging and per-session error isolation in sweep loop

## 5. Implement UI changes

- [x] 5.1 Add `sessionTtlDays` control to Session Settings runtime section
- [x] 5.2 Pass inactivity state to Session Detail page view model
- [x] 5.3 Gate Delete Session button rendering on inactivity predicate

## 6. Verify

- [ ] 6.1 Run `cd packages/mimo-platform && bun test`
- [x] 6.2 Run targeted session-management tests and confirm green
