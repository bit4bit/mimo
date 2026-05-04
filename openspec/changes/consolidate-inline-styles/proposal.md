## Why

The codebase contains 330 inline style declarations scattered across TSX files, with severe duplication (74× `color: #888`, 53× `font-size: 12px`, 43× `display: none`). This makes the UI hard to maintain, inconsistent, and resistant to theming. Additionally, there are byte-identical copies of buffer components in two locations (`domain/buffers/` and `web/features/sessions/components/buffers/`), compounding the duplication problem.

## What Changes

- **Deduplicate buffer components**: Eliminate byte-identical copies of buffer components by consolidating to a single canonical location and updating imports.
- **Introduce conceptual CSS classes**: Create semantic CSS classes in `Layout.tsx`'s global `<style>` block to replace duplicated inline styles. Classes will describe *what* a component is (e.g., `.dialog-overlay`, `.buffer-container`, `.text-muted`) rather than *how it looks*.
- **Migrate inline styles to classes**: Replace inline `style={{...}}` and `style="..."` attributes with `className="..."` across all affected components.
- **Standardize visibility toggles**: Convert the 43 `display: none` inline patterns to conditional className toggling (e.g., `.toolbar.hidden`).

## Capabilities

### New Capabilities
- `ui-conceptual-css`: A standardized set of semantic CSS classes for common UI patterns (dialogs, buffers, typography, layout primitives) that replaces inline styling across the application.

### Modified Capabilities
<!-- No existing capability requirements are changing - this is a pure refactoring. -->

## Impact

- **Affected**: All TSX components in `packages/mimo-platform/src/web/` that use inline styles
- **Root component**: `packages/mimo-platform/src/web/shared/components/Layout.tsx` (global `<style>` block expansion)
- **Build**: No changes - CSS remains inline in the HTML output
- **Behavior**: No user-facing behavior changes - pure visual refactoring
- **Testing**: Visual regression testing recommended; existing unit tests should continue to pass
