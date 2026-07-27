## Context

mimo renders pages server-side via a shared `Layout` component (`packages/mimo-platform/src/web/shared/components/Layout.tsx`). The `<head>` is built once per page render; navigation is a full page load, not client-side routing. Today every page emits the same default favicon (no `<link rel="icon">` is set at all) and a title of the form `<page> | MIMO`. With multiple tabs open, users cannot visually distinguish one project's tab from another.

A `Project` is identified by a stable `id` (UUID-style string) and a human `name`. There is currently no per-project color or icon, and no field on the `Project` model to carry one.

SVG favicons are supported by all evergreen browsers (Chrome, Firefox, Safari 12+, Edge). A 32x32 SVG with a colored rounded square and a single text glyph encodes to a ~300-byte data URI and requires no asset pipeline, no caching, and no external files.

## Goals / Non-Goals

**Goals:**
- Give every project a stable, deterministic visual identity (color + glyph) in the browser tab.
- Same project always produces the same icon, across tabs, sessions, reloads, machines.
- Zero new persisted state, zero migrations, zero new external assets.
- Reserve room on the `Project` model for future user-customizable color/glyph without exposing UI now.
- Keep all icon generation in a pure, side-effect-free module so it can be unit-tested and reused (e.g. for project cards later).

**Non-Goals:**
- User-facing UI to pick a color or glyph (reserved for a later change).
- Per-session icon variants (a project's icon is identical across all its sessions).
- Replacing the dashboard / auth / project-list favicon with a project-derived icon (those pages have no active project and keep a default MIMO icon).
- Mobile PWA / apple-touch-icon generation (can be added later cheaply; out of scope here).
- Changing the `<title>` text format (independent concern; can be a separate change).

## Decisions

### Decision 1: Derive hue from `project.id`, glyph from `project.name`

Hue is computed as `hash(project.id) % 360` using a small scrambling hash (FNV-1a or cyrb53). The glyph is the first character of `project.name` uppercased.

**Rationale:** Deriving the hue from the immutable `id` means renaming a project keeps its color (preserves muscle memory). Deriving the glyph from the current `name` keeps the icon legible when the user renames a project. Deriving both from `name` would re-roll the color on every rename, which is disorienting; deriving both from `id` produces a meaningless glyph.

**Alternatives considered:**
- Derive hue from `name`: lets users "re-roll" by renaming, but breaks visual continuity. Rejected.
- Use a geometric shape instead of a letter: language-agnostic and collision-free, but less memorable and harder to distinguish at 16px. Rejected for v1; can be added later as a fallback when `name` is empty.
- Two-letter monogram: better disambiguation, but too tight at 16px in a tab. Rejected for v1.

### Decision 2: Output is an inline SVG data URI, injected by `Layout`

The favicon is emitted as `<link rel="icon" href="data:image/svg+xml,...">` inside the `<head>` produced by `Layout`. `Layout` already receives `projectId` (used for the `window.MIMO_PROJECT_ID` script) and `projectName` (used in the header). It computes the data URI inline when both are present; otherwise it emits a default MIMO favicon.

**Rationale:** Server-side render already has the project context. No client-side script, no SPA assumption, no fetch. Works on every page that goes through `Layout`.

**Alternatives considered:**
- A client-side script that updates the favicon on project switch: only needed if project switching becomes client-side. Today every project switch is a hard navigation. Rejected for v1; the helper module can be reused later if needed.
- A dedicated `/favicon/:projectId` route serving SVG: adds a route, caching headers, and an asset pipeline for no benefit over a data URI. Rejected.

### Decision 3: HSL background with luminance-based text color

Background is `hsl(hue, 65%, 52%)`. Text color is white `#ffffff` or near-black `#1a1a1a`, chosen by a luminance threshold on the background RGB (`L = 0.299r + 0.587g + 0.114b`; text is dark when `L > 0.6`).

**Rationale:** Tabs render against both light and dark browser chrome. A mid-saturation, mid-lightness background reads on both. The luminance check prevents low-contrast pairings (e.g. yellow background with white text).

**Alternatives considered:**
- Always white text: fails on yellow/light backgrounds. Rejected.
- Two separate SVGs for light/dark browser chrome via `media` query on `<link>`: more correct, but adds complexity. Noted as a future enhancement, not v1.

### Decision 4: Pure helper module, no I/O, no globals

A new module (e.g. `src/web/shared/favicons.ts`) exports pure functions: `hashId(id) → number`, `hueFromId(id) → number`, `glyphFromName(name) → string`, `textColorForHue(hue) → string`, `buildFaviconSvg({id, name}) → string`, `buildFaviconDataUri({id, name}) → string`. `Layout` imports `buildFaviconDataUri`.

**Rationale:** Purity keeps it testable, dependency-injected-friendly (per repo conventions), and reusable by future surfaces (project cards, dashboard). No hidden globals (per AGENTS.md).

### Decision 5: Reserve optional override fields on `Project`

`Project`, `ProjectData`, and `PublicProject` gain optional `color?: string` (CSS color) and `iconGlyph?: string` (single character). When present, `color` overrides the derived hue and `iconGlyph` overrides the derived glyph. The repository passes them through unchanged when unset; no migration, no validation beyond type. The favicon generator consults them; the UI does not expose them.

**Rationale:** Locks in the extension point now, when we already touch the model, without committing to a customization UI. Backward-compatible — existing `project.yaml` files without the fields continue to work.

**Alternatives considered:**
- Defer the fields until the customization UI lands: means a second schema bump later. Rejected; reserving now is cheap.
- Store the derived values back to the model to "freeze" them: breaks determinism and adds writes. Rejected.

## Risks / Trade-offs

- **[Hue collisions across projects]** Two projects may hash to nearby hues and look similar at a glance. → Mitigation: acceptable for v1; a future "re-roll" UI or a golden-angle walk over a per-user project index can reduce collisions if it becomes a real complaint.
- **[Glyph collisions when projects share an initial]** Several projects named `api-*` all get `A`. → Mitigation: the hue still differs; if it becomes a problem, switch to a two-letter monogram or shape fallback in a later change.
- **[SVG favicon support on very old browsers]** IE and Safari < 12 fall back to no favicon. → Mitigation: acceptable; mimo already requires a modern browser for its streaming UI.
- **[Empty project name]** `glyphFromName("")` must return a sane fallback (e.g. a filled circle) rather than crash. → Mitigation: explicit empty-name handling in the helper and a unit test for it.
- **[Non-ASCII project names]** First-character glyph may be an emoji or combining mark. → Mitigation: take the first *grapheme* (via `Intl.Segmenter` where available, else first code point); cap the rendered font-size so wide glyphs still fit. Document the behavior.

## Migration Plan

1. Add the optional `color` / `iconGlyph` fields to the `Project` interfaces and repository pass-through. Existing `project.yaml` files without these fields deserialize normally (optional fields).
2. Add the pure favicon helper module with unit tests.
3. Thread `projectId` / `projectName` into `Layout` for any page that has a project context but does not currently forward them.
4. Emit the favicon `<link>` from `Layout` when project context is present; emit a default MIMO favicon otherwise.
5. No data migration, no deploy coordination, no feature flag. Rollback is reverting the `Layout` change; the optional model fields are harmless if unused.

## Open Questions

- Should the dashboard project cards also render the derived color so the identity appears in-list, not just in tabs? (Likely yes, but that is a separate surface and could be a follow-up change.)
- Should the `<title>` format change to lead with the project name (`my-cool-project · My Session — MIMO`)? Orthogonal to the icon; recommend a separate change if desired.