## Why

Sessions accumulate forever. Need bounded retention with safe cleanup path.
Need auto-delete only when session truly idle; never delete active session.

## What Changes

- Add session TTL config in days: `sessionTtlDays`.
- Default TTL = `180` days (about 6 months).
- Add activity marker: `lastActivityAt`.
- Add background sweeper run every 10 minutes.
- Auto-delete only when `expired & inactive`.
- Reuse exact cleanup path from existing Delete Session behavior.
- Show Delete Session button only when session inactive.

## Capabilities

### Modified Capabilities

- `session-management`: add TTL-in-days retention and inactivity-gated deletion.
- `chat-streaming-state`: session activity updates last-activity marker for retention safety.

## Impact

- `packages/mimo-platform/src/sessions/repository.ts`: persist `sessionTtlDays`, `lastActivityAt`, defaults, validation.
- `packages/mimo-platform/src/sessions/routes.tsx`: parse/validate creation-time TTL, share delete use-case, update activity on user actions, expose inactive state.
- `packages/mimo-platform/src/index.tsx`: schedule 10-minute TTL sweeper.
- `packages/mimo-platform/src/components/SessionCreatePage.tsx`: TTL days control at session creation.
- `packages/mimo-platform/src/components/SessionSettingsPage.tsx`: TTL days control in runtime settings.
- `packages/mimo-platform/src/components/SessionDetailPage.tsx`: hide delete button while active.
- `packages/mimo-platform/test/sessions.test.ts`: add behavior tests for TTL defaults, validation, sweeper decisions, UI gate.
