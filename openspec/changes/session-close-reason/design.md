## Context

Currently, closing a session is a one-click action with a JavaScript `confirm()` dialog. The POST handler updates `status: "closed"` but captures no metadata about why the session ended. Session lists across the UI display status badges (active/paused/closed) but provide no context for closed sessions.

This change introduces a dedicated close page that captures a reason before closing, and displays that reason in session lists.

## Goals / Non-Goals

**Goals:**

- Provide a form page for closing sessions that captures a reason
- Persist close reason in session data
- Display close reason in session list views for closed sessions
- Ensure cancel/close always return to the originating session detail page
- Maintain backward compatibility (existing closed sessions have no reason)

**Non-Goals:**

- Close reason is not required (optional field)
- No validation rules on reason content (free text)
- No search/filter by close reason
- No change to delete behavior (delete still bypasses reason)

## Decisions

### Dedicated page vs inline modal

**Decision**: Dedicated `GET /projects/:projectId/sessions/:id/close` page
**Rationale**: Matches existing server-rendered pattern (edit pages, settings pages). Works without JavaScript. Clean separation. Easy to extend later (e.g., "Close and commit" checkbox).

### Reason input: radio group + optional note

**Decision**: Render a radio group (not a `<select>`) with four options — `implemented`, `invalid expectations`, `wrong implementation`, `no reason` — plus a separate optional free-text note input.
**Rationale**: All options stay visible at once (radio), no JS required, fits the server-rendered form. The fixed list gives consistent categories; the note allows detail when one of the labels is not enough. `no reason` is an explicit escape so the user can close without categorizing.

### Resolving reason and note into one stored value

**Decision**: Store a single `closeReason: string`. The note wins when typed (non-empty after trim); otherwise the selected radio label is stored. `no reason` with an empty note stores nothing (`undefined`). The radio label and note are never concatenated.
**Rationale**: User explicitly wants one message, not a combined string. Note-overrides-radio keeps the model simple: the radio is a fast default, the note a free-form override. No second storage field needed, so the data model and YAML files are unchanged beyond the existing `closeReason`.

### Return navigation

**Decision**: Use `Referer` header with fallback to session detail page
**Rationale**: Simple, works with existing navigation patterns. If user opens close page directly (no referer), fallback to `/projects/:projectId/sessions/:id`.

### Data model approach

**Decision**: Add `closeReason?: string` to Session/SessionData interfaces
**Rationale**: Minimal change. YAML file storage means no migration script needed — existing files just won't have the field (undefined). Clean and backward compatible.

### Display in lists

**Decision**: Show close reason as muted text next to status badge in ProjectsSessionsPage
**Rationale**: SessionList component is generic and used in multiple contexts. Only show in full session list, not in compact finder. Tooltip on hover if reason is long.

## Risks / Trade-offs

- **[Risk] Users forget why they closed a session** → Mitigation: Optional field, no validation. User can leave blank.
- **[Risk] Long close reasons clutter UI** → Mitigation: Truncate with ellipsis, show full on hover.
- **[Risk] Direct POST to /close bypasses the form** → Mitigation: Not a security concern, just a UX gap. API accepts optional reason.

## Migration Plan

No migration needed. Existing sessions simply won't have `closeReason` (undefined). The field is optional.

## Open Questions

None.
