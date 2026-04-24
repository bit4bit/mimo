## 1. Config — add openSessionFinder keybinding

- [x] 1.1 Add `openSessionFinder?: string` to `GlobalKeybindingsConfig` interface in `packages/mimo-platform/src/config/service.ts`
- [x] 1.2 Add `openSessionFinder: "Control+Shift+3"` to `defaultGlobalKeybindings` in `packages/mimo-platform/src/config/service.ts`

## 2. Backend — sessions search endpoint

- [x] 2.1 Add `GET /sessions/search` route to `packages/mimo-platform/src/sessions/routes.tsx` (before `/:id`)
- [x] 2.2 Implement auth check (reuse `getAuthUsername`), return 401 if unauthenticated
- [x] 2.3 Query all sessions for owner, join project names; filter by `q` substring match on session name or project name (case-insensitive); empty `q` returns up to 10 most recent by `lastActivityAt`/`createdAt`
- [x] 2.4 Return JSON array of `{sessionId, sessionName, projectId, projectName, status}`
- [x] 2.5 Write integration tests for: search with query, empty query returns recents, owner scoping, unauthenticated 401

## 3. UI — SessionFinderDialog component

- [x] 3.1 Create `packages/mimo-platform/src/components/SessionFinderDialog.tsx` — hidden overlay with input, results list, and Esc-to-close hint; no sessionId dependency

## 4. Layout — wire dialog into all pages

- [x] 4.1 Add `showSessionFinder?: boolean` prop to `Layout.tsx`
- [x] 4.2 Render `<SessionFinderDialog />` when `showSessionFinder` is true
- [x] 4.3 Load `session-finder.js` (non-deferred) when `showSessionFinder` is true
- [x] 4.4 Pass `showSessionFinder={true}` from authenticated routes: projects, dashboard, session detail

## 5. Client — session-finder.js

- [x] 5.1 Create `packages/mimo-platform/public/js/session-finder.js`
- [x] 5.2 Read `openSessionFinder` from `window.MIMO_GLOBAL_KEYBINDINGS` (default `Control+Shift+3`)
- [x] 5.3 Register global `keydown` listener: match keybinding → open dialog, fetch `/sessions/search` (empty q), focus input
- [x] 5.4 Register input `keydown`/`input` listener: debounce 200ms → fetch `/sessions/search?q=<value>` → render results
- [x] 5.5 Render result rows: session name, project name, status badge; highlight first result by default
- [x] 5.6 Tab = next result, Shift+Tab = previous result (with wrap-around)
- [x] 5.7 Enter = `window.open('/projects/:pid/sessions/:sid', 'session-' + sid)` on highlighted result, close dialog
- [x] 5.8 Escape = close dialog, clear input
- [x] 5.9 Click outside dialog content = close dialog
- [x] 5.10 Alt+Shift+G = close dialog (global cancel shortcut)

## 6. Global keybindings JS — register openSessionFinder

- [x] 6.1 Add `openSessionFinder: "Control+Shift+3"` to `DEFAULT_GLOBAL_KEYBINDINGS` in `packages/mimo-platform/public/js/session-keybindings.js`
- [x] 6.2 Dispatch custom event `mimo:openSessionFinder` when keybinding fires (session-finder.js listens for it)

## 7. Keybinding Helper Display

- [x] 7.1 Add "Find session" and "Close finder" to shortcuts bar in SessionDetailPage.tsx
