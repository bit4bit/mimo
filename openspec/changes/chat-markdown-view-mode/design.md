## Context

Assistant message boxes in the chat thread (`packages/mimo-platform/public/js/chat.js`) carry a per-message view toggle (👁). State lives in `div.dataset.viewMode` and currently holds `"decorated"` or `"plain"`. The click handler (~line 2475) flips between `renderDecoratedContent` and `renderPlainContent`, both sourcing from `contentEl.dataset.rawText`. Decorated mode uses a custom inline-markup parser (no real markdown); plain mode is raw text.

The `marked` library is already vendored (`public/vendor/marked.min.js`), loaded via `Layout.tsx`, and embedded via `assets.ts`. It is currently used only by `help-tooltip.js` (`MarkedRenderer`, on trusted maintainer content). Frontend is vanilla JS + Hono JSX SSR; no React/Vue.

## Goals / Non-Goals

**Goals:**
- Add a third view mode "markdown" that renders agent text as real markdown via `marked.parse`.
- Extend the existing per-message toggle into a 3-way cycle without changing its per-message, raw-text-sourced semantics.
- Style markdown elements legibly within `.message-content`.

**Non-Goals:**
- HTML sanitization / DOMPurify (explicitly excluded — see Decisions).
- Replacing the existing decorated parser.
- Global/thread-wide markdown preference (scope is per-message only).
- Syntax highlighting of code blocks (plain `<pre>` is acceptable; highlight integration deferred).
- Changing user-message or streaming rendering behavior beyond the toggle cycle.

## Decisions

**1. Extend `dataset.viewMode` to three states, cycle in fixed order.**
`decorated → plain → markdown → decorated`. The existing if/else toggle handler becomes a 3-way advance (lookup or switch on current mode). Chosen over a separate dedicated markdown button to keep one control and match the existing single-toggle UX. Alternative (separate button) rejected: more header clutter, diverges from established pattern.

**2. New `renderMarkdownContent(rawText, contentEl)` placed beside `renderPlainContent`.**
Body: `contentEl.innerHTML = marked.parse(rawText)`. Reuses the global `marked` already on the page. Mirrors the existing render-fn shape so the toggle handler stays symmetric.

**3. No sanitization (accepted XSS risk).**
Raw `marked` output → `innerHTML` with no DOMPurify. Rationale: avoid adding a vendor dependency + embed plumbing; agent output treated as trusted-enough for this product. This matches `help-tooltip.js`'s existing unsanitized `marked` usage. Alternative (DOMPurify) rejected by product decision for simplicity. Risk is documented in proposal and spec.

**4. Graceful fallback when `marked` is undefined.**
If `typeof marked === "undefined"`, fall back to plain rendering (`renderPlainContent`) so a missing/late-loaded vendor never produces a blank box. Mirrors `MarkedRenderer.fallbackRender` intent without duplicating its parser.

**5. CSS scoped to `.message-content`.**
Add rules for `table/th/td`, `ul/ol/li`, `blockquote`, `h1..h6`, `pre/code` under `.message-content` so markdown HTML is legible. Scoping prevents leaking styles to decorated/plain modes (which don't emit these elements).

## Risks / Trade-offs

- [Unsanitized `innerHTML` → XSS if agent echoes hostile HTML] → Accepted by product; documented in proposal + spec. Revisit by adding DOMPurify if threat model changes.
- [Vendored `marked` lacks GFM tables / is too old] → Verify the bundled `marked.min.js` renders GFM tables during implementation; enable `{ gfm: true }` if needed.
- [Markdown HTML unstyled / ugly] → Mitigated by Decision 5 (scoped CSS).
- [Streaming interaction: toggling to markdown mid-stream] → Markdown renders from `dataset.rawText` like the other modes; behavior consistent with existing toggle during streaming.

## Open Questions

- Code-block syntax highlighting via the existing `highlight` vendor — deferred (Non-Goal) unless requested.
