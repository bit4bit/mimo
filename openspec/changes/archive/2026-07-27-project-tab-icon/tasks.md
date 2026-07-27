## 1. Favicon helper module (pure, unit-tested)

- [x] 1.1 Create `packages/mimo-platform/src/web/shared/favicons.ts` exporting pure functions: `hashId`, `hueFromId`, `glyphFromName`, `textColorForHue`, `buildFaviconSvg`, `buildFaviconDataUri`
- [x] 1.2 Implement `hashId(id: string): number` using a scrambling hash (FNV-1a or cyrb53)
- [x] 1.3 Implement `hueFromId(id: string): number` as `hashId(id) % 360`
- [x] 1.4 Implement `glyphFromName(name: string): string` returning the first grapheme uppercased (via `Intl.Segmenter` where available, else first code point), with empty-name fallback returning a sentinel that the SVG builder renders as a filled circle
- [x] 1.5 Implement `textColorForHue(hue: number): string` using luminance threshold (`L = 0.299r + 0.587g + 0.114b`, dark text when `L > 0.6`, else white)
- [x] 1.6 Implement `buildFaviconSvg({id, name, color?, iconGlyph?}): string` producing a 32x32 SVG with `hsl(hue, 65%, 52%)` rounded-rect background (or `color` override), single `<text>` glyph (or fallback circle), foreground color from `textColorForHue` (or computed from the override)
- [x] 1.7 Implement `buildFaviconDataUri(input): string` URL-encoding the SVG into `data:image/svg+xml,...`
- [x] 1.8 Write unit tests covering: same id/name → identical URI; different ids → different hues; empty name → fallback circle; luminance threshold picks dark vs light text; explicit `color`/`iconGlyph` overrides win; no I/O performed

## 2. Project model extension (optional override fields)

- [x] 2.1 Add optional `color?: string` and `iconGlyph?: string` to `Project`, `ProjectData`, and `PublicProject` in `packages/mimo-platform/src/domain/projects/repository.ts`
- [x] 2.2 Update repository serialization/deserialization to pass `color` and `iconGlyph` through unchanged when present and omit them when absent (no validation beyond type)
- [x] 2.3 Update `CreateProjectInput` (and any update input) to accept optional `color`/`iconGlyph`
- [x] 2.4 Verify existing `project.yaml` files without the fields still deserialize correctly (no migration)

## 3. Wire favicon into Layout

- [x] 3.1 In `packages/mimo-platform/src/web/shared/components/Layout.tsx`, accept `projectId` and `projectName` (already present) and optional `projectColor`/`projectIconGlyph`
- [x] 3.2 In the `<head>`, emit `<link rel="icon" href={faviconDataUri}>`: when `projectId` and `projectName` are present use `buildFaviconDataUri({id, name, color, iconGlyph})`, otherwise emit a default MIMO favicon data URI (or a static default asset)
- [x] 3.3 Ensure the favicon `<link>` is rendered on every page that goes through `Layout`, including pages without a project (default path)

## 4. Thread project context into all project-bound pages

- [x] 4.1 Audit pages that render inside a project context but do not currently forward `projectId`/`projectName` (and the new override fields) to `Layout`
- [x] 4.2 Update each such page to forward `projectId`, `projectName`, `projectColor`, `projectIconGlyph` from its loaded `Project`
- [x] 4.3 Confirm non-project pages (dashboard, project list, auth, errors) intentionally pass no project context so they get the default favicon

## 5. Verification

- [x] 5.1 Run `bun test` in `packages/mimo-platform` and ensure all existing tests pass plus new favicon tests pass
- [x] 5.2 Run `bun run test.full` in `packages/mimo-platform` for the full suite
- [ ] 5.3 Manually verify in a browser: open two sessions from two different projects as separate tabs and confirm the tab favicons differ in color/glyph; reload a tab and confirm the favicon is stable; open the dashboard and confirm the default favicon appears