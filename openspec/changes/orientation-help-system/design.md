## Context

The MIMO platform is a Hono-based web application with server-side JSX rendering and vanilla JavaScript frontend. Users navigate between dashboards, projects, sessions, and configuration pages. Currently, there is no contextual documentation system—users must discover functionality through exploration or external docs.

The orientation help system will provide immediate, contextual tooltips by reading documentation from a local `~/.mimo/help.yaml` file. This approach allows users to customize their own help content while keeping the system simple and offline-capable.

**Current constraints:**
- Frontend uses vanilla JavaScript (no React/Vue frameworks)
- Assets are served from `public/` and embedded in compiled binaries
- MIMO_HOME environment variable controls where user data lives
- No external CDN dependencies (all assets vendored)

## Goals / Non-Goals

**Goals:**
- Provide contextual tooltips on hover for UI elements with documentation
- Load help content from user's local `~/.mimo/help.yaml` file
- Render markdown content in tooltips
- Allow markdown parser swapping via seam interface
- Automate help ID generation via one-time script
- Position tooltips relative to elements with viewport collision detection

**Non-Goals:**
- No caching of help content (fresh read on every API call)
- No XSS sanitization (user owns their help.yaml)
- No remote help content fetching
- No real-time help editing (edit file and refresh)

## Decisions

### Decision 1: Flat ID structure
**Choice**: Use flat contextual IDs like `dashboard-stats-projects`, `session-chat-input`
**Rationale**: 
- Simple to scan and search in help.yaml
- No nesting complexity
- Clear naming convention: `page-section-element`
- **Rejected**: Hierarchical YAML structure—adds complexity without benefit

### Decision 2: Vendored marked.js vs. custom parser
**Choice**: Download and vendor `marked.min.js` (~40KB) to `public/vendor/`
**Rationale**:
- No external CDN dependencies (already required by project policy)
- Full markdown support without implementation effort
- Seam interface allows future swapping to lightweight parser
- **Rejected**: Custom parser—would require ongoing maintenance for edge cases

### Decision 3: API endpoint with no caching
**Choice**: `GET /api/help` reads and parses YAML on every request
**Rationale**:
- Help file is small (likely < 100 entries)
- No cache invalidation complexity
- Users see changes immediately on page refresh
- **Rejected**: File watching or in-memory cache—unnecessary complexity for read frequency

### Decision 4: Event delegation for hover detection
**Choice**: Single event listener on document using `mouseenter` delegation
**Rationale**:
- Efficient for dynamic content (no per-element listeners)
- Works with elements added after initial load
- **Rejected**: Individual element listeners—memory overhead and maintenance burden

### Decision 5: Automated ID generation (one-time)
**Choice**: Script `scripts/generate-help-ids.ts` that scans JSX and injects IDs
**Rationale**:
- Ensures consistent ID naming
- Generates skeleton help.yaml entries automatically
- Run once manually, not part of build process
- **Rejected**: Manual ID assignment—prone to inconsistency; build-time script—unnecessary overhead

### Decision 6: Tooltip positioning relative to element
**Choice**: Calculate position relative to hovered element, not viewport-fixed
**Rationale**:
- Tooltip follows element if page scrolls
- More intuitive user experience
- **Rejected**: Fixed viewport positioning—would disconnect from element on scroll

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Help.yaml grows large | No mitigation needed—YAML parsing is fast for reasonable sizes |
| Marked.js security issues | Vendored version is pinned; seam allows swapping if needed |
| ID collisions from script | Script generates contextual names; manual review recommended |
| Performance on pages with many help elements | Event delegation is O(1) regardless of element count |
| Users confused by missing tooltips | Document that empty help.yaml = no tooltips; provide sample file |

## Migration Plan

**Deployment steps:**
1. Run `bun run scripts/generate-help-ids.ts` to generate IDs and skeleton YAML
2. Review generated IDs for naming consistency
3. Copy skeleton to `~/.mimo/help.yaml` and customize content
4. Deploy code changes
5. Verify `/api/help` returns expected JSON

**Rollback:**
- Remove `help-tooltip.js` from Layout.tsx script tags
- No database migrations or data changes required

## Open Questions

None—design is complete based on exploration decisions.
