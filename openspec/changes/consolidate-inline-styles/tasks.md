## 1. Deduplicate Buffer Components

- [x] 1.1 Compare `domain/buffers/` and `web/features/sessions/components/buffers/` to confirm byte-identical copies
- [x] 1.2 Find all imports referencing `domain/buffers/` and update them to `web/features/sessions/components/buffers/`
- [x] 1.3 Delete `domain/buffers/` directory
- [x] 1.4 Run tests to verify no broken imports

## 2. Add Conceptual CSS Classes to Layout.tsx

- [x] 2.1 Add Dialog/Overlay classes: `.dialog-overlay`, `.dialog-header`, `.dialog-help`
- [x] 2.2 Add Buffer/Layout classes: `.buffer-container`, `.tab-bar`, `.toolbar`, `.toolbar.hidden`
- [x] 2.3 Add Typography tokens: `.text-primary`, `.text-muted`, `.text-small`, `.text-error`, `.font-mono`
- [x] 2.4 Add Component classes: `.empty-state`, `.status-bar`, `.status-bar.hidden`, `.page-header`, `.page-description`, `.code-input`
- [x] 2.5 Add Utility classes: `.flex`, `.flex-col`, `.flex-grow`, `.hidden`
- [x] 2.6 Verify Layout.tsx compiles and renders correctly

## 3. Migrate Dialog Components

- [x] 3.1 Replace inline styles in `ContentFinderDialog.tsx` with new CSS classes
- [x] 3.2 Replace inline styles in `FileFinderDialog.tsx` with new CSS classes
- [x] 3.3 Replace inline styles in `SessionFinderDialog.tsx` with new CSS classes
- [ ] 3.4 Verify dialogs render identically after migration

## 4. Migrate Buffer Components

- [x] 4.1 Replace inline styles in `ChatBuffer.tsx` with new CSS classes
- [x] 4.2 Replace inline styles in `ChatThreadsBuffer.tsx` with new CSS classes
- [x] 4.3 Replace inline styles in `EditBuffer.tsx` with new CSS classes
- [x] 4.4 Replace inline styles in `PatchBuffer.tsx` with new CSS classes
- [x] 4.5 Replace inline styles in `SummaryBuffer.tsx` with new CSS classes
- [x] 4.6 Replace inline styles in `McpServersBuffer.tsx` with new CSS classes
- [x] 4.7 Replace inline styles in `NotesBuffer.tsx` with new CSS classes
- [x] 4.8 Verify buffers render identically after migration

## 5. Migrate Page Components

- [x] 5.1 Replace inline styles in `DashboardPage.tsx` with new CSS classes
- [x] 5.2 Replace inline styles in `LandingPage.tsx` with new CSS classes
- [x] 5.3 Replace inline styles in `ProjectCreatePage.tsx` with new CSS classes
- [x] 5.4 Replace inline styles in `ProjectEditPage.tsx` with new CSS classes
- [x] 5.5 Replace inline styles in `ProjectsSessionsPage.tsx` with new CSS classes
- [x] 5.6 Replace inline styles in `ImpactHistoryPage.tsx` with new CSS classes
- [x] 5.7 Replace inline styles in `CredentialsListPage.tsx` with new CSS classes
- [x] 5.8 Replace inline styles in `McpServerListPage.tsx` with new CSS classes
- [x] 5.9 Replace inline styles in `McpServerFormPage.tsx` with new CSS classes
- [x] 5.10 Replace inline styles in `ConfigEditorPage.tsx` with new CSS classes
- [x] 5.11 Replace inline styles in `agents.tsx` with new CSS classes

## 6. Migrate Session Components

- [x] 6.1 Replace inline styles in `SessionDetailPage.tsx` with new CSS classes
- [x] 6.2 Replace inline styles in `SessionCreatePage.tsx` with new CSS classes
- [x] 6.3 Replace inline styles in `SessionSettingsPage.tsx` with new CSS classes
- [x] 6.4 Replace inline styles in `sessions.tsx` with new CSS classes
- [x] 6.5 Replace inline styles in `ImpactBuffer.tsx` with new CSS classes

## 7. Handle display:none Toggle Pattern

- [x] 7.1 Audit all 43 `display: none` inline styles and identify which are conditional
- [x] 7.2 Convert conditional `display: none` to `.hidden` modifier class toggling
- [x] 7.3 Update JavaScript that controls visibility to use classList.add/remove("hidden")
- [x] 7.4 Verify toggle behavior works correctly after migration

## 8. Final Verification

- [x] 8.1 Run full test suite: `cd packages/mimo-platform && bun run test.full`
- [ ] 8.2 Do a visual audit of key pages (Dashboard, Session Detail, Dialogs, Buffers)
- [x] 8.3 Confirm no inline styles remain for static CSS properties
- [x] 8.4 Update AGENTS.md or developer docs if needed
