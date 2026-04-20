§G
Normalize list UI ∀ pages. Replace card layouts with `DataTable`. Add search + pagination. UX stays friendly @ >10 items.

§C
- Hono JSX SSR. Client JS minimal (search + pagination only).
- Keep existing test assertions: empty state copy, ordering, links, create buttons.
- Dark theme, monospace font, existing color palette.
- Mobile: horizontal scroll on narrow screens.
- Rich content (MCP commands, credential fields) truncated or simplified in cells.

§I
- `DataTable.tsx` → reusable table with search + pagination
- `Layout.tsx` → shared `.data-table*` styles
- `SessionListPage.tsx` → sessions page
- `ProjectDetailPage.tsx` → embedded sessions
- `agents/routes.tsx` → agents list + agent detail sessions
- `McpServerListPage.tsx` → MCP servers list
- `CredentialsListPage.tsx` → credentials list
- `ProjectsListPage.tsx` → projects list
- `DashboardPage.tsx` → recent items sections

§V
V1: ∀ entity list render → `DataTable` component
V2: rows > pageSize → pagination controls visible
V3: search input ≠ empty → filters rows client-side, hides pagination
V4: status badge colors → consistent `active=#2d5a2d`, `paused=#5a5a2d`, `closed=#5a2d2d`
V5: empty state copy → preserves existing text where tested
V6: sort order → createdAt desc (newest first) ∀ lists
V7: table header style → `background=#252525`, uppercase, 11px, color=#888
V8: table row hover → `background=#2a2a2a`

§T
id|status|task|cites
T1|x|create `DataTable` component with table, search, pagination|V1,V4
T2|x|update `Layout.tsx` add `.data-table*` styles|V1,V7,V8
T3|x|refactor `SessionListPage.tsx` use `DataTable`|V1,V5
T4|x|refactor `ProjectDetailPage.tsx` use `DataTable`|V1,V5
T5|x|refactor `agents/routes.tsx` agents list + detail use `DataTable`|V1
T6|x|refactor `McpServerListPage.tsx` use `DataTable`|V1
T7|x|refactor `CredentialsListPage.tsx` use `DataTable`|V1
T8|x|refactor `ProjectsListPage.tsx` use `DataTable`|V1
T9|x|update `DashboardPage.tsx` add "View all" links|V1
T10|x|run tests, fix regressions|V5,V6

§B
id|date|cause|fix
