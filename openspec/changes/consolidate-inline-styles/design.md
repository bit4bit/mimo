## Context

The codebase has 330 inline style declarations across TSX files in `packages/mimo-platform/src/web/`. The highest-frequency patterns are:
- 74× `color: #888`
- 53× `font-size: 12px`
- 43× `display: none`
- 42× `display: flex`
- 26× `flex: 1`

Additionally, there are byte-identical copies of buffer components in:
- `packages/mimo-platform/src/domain/buffers/`
- `packages/mimo-platform/src/web/features/sessions/components/buffers/`

The existing `Layout.tsx` already contains a ~400-line global `<style>` block with foundational CSS. This is the natural root location to extend with new conceptual classes.

## Goals / Non-Goals

**Goals:**
- Eliminate duplicated inline styles by replacing them with reusable conceptual CSS classes
- Deduplicate byte-identical buffer component copies
- Improve maintainability and consistency of the UI styling
- Establish a semantic naming convention (what it is, not how it looks)

**Non-Goals:**
- No new visual design or color scheme changes
- No changes to component behavior or user interactions
- No introduction of external CSS frameworks (Tailwind, Bootstrap, etc.)
- No conversion to CSS-in-JS or CSS Modules
- No support for light theme or dynamic theming

## Decisions

**1. Use Layout.tsx global `<style>` block as the CSS root**
- *Rationale*: The application already uses this pattern successfully. No build pipeline changes needed.
- *Alternative considered*: External CSS file in `public/` — rejected because it would require additional asset serving logic and the current inline approach works with the compiled binary.

**2. Semantic/conceptual class naming over utility classes**
- *Rationale*: `.dialog-overlay` is more meaningful than `.flex.justify-center.items-start.pt-20`. The codebase is small enough that conceptual names are self-documenting.
- *Alternative considered*: Utility-first (Tailwind-style) — rejected because it would create class soup in JSX and doesn't match the existing codebase style.

**3. Handle `display: none` via `.hidden` modifier classes**
- *Rationale*: The 43 occurrences of `display: none` are mostly conditional visibility. Using a modifier class (`.toolbar.hidden`) allows JavaScript to toggle visibility by adding/removing a class.
- *Pattern*: Base class defines layout (`.toolbar { display: flex; ... }`), modifier hides (`.toolbar.hidden { display: none; }`).

**4. Consolidate buffer copies to `web/features/sessions/components/buffers/`**
- *Rationale*: The `web/` tree is the active UI layer. `domain/buffers/` appears to be an older copy.
- *Action*: Delete `domain/buffers/`, update any imports pointing to it.

## Risks / Trade-offs

- **[Risk] Large touch surface** → 330 inline styles across many files means a high chance of missing one or introducing a typo during migration. **Mitigation**: Batch by directory, verify each batch visually.
- **[Risk] Visual regressions** → Removing inline styles and replacing with classes may subtly change specificity or inheritance. **Mitigation**: Test representative pages after each batch; the existing dark theme is consistent enough that deviations will be obvious.
- **[Risk] Merge conflicts** → Long-running refactor touching many files. **Mitigation**: Complete quickly in focused batches; avoid interleaving with other feature work.
- **[Trade-off] CSS bundle size** → Adding ~50-100 new CSS rules increases the HTML payload. **Mitigation**: The rules replace inline styles that were already being sent; net size should decrease due to deduplication.
