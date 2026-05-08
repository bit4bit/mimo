## ADDED Requirements

### Requirement: Semantic CSS classes replace duplicated inline styles

The system SHALL provide a set of semantic CSS classes in `Layout.tsx`'s global `<style>` block that cover all frequently duplicated inline style patterns.

#### Scenario: Dialog overlay styling

- **WHEN** a dialog component uses the `.dialog-overlay` class
- **THEN** it SHALL render with: `position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: flex-start; padding-top: 80px`

#### Scenario: Buffer container styling

- **WHEN** a buffer component uses the `.buffer-container` class
- **THEN** it SHALL render with: `display: flex; flex-direction: column; height: 100%`

#### Scenario: Typography tokens

- **WHEN** a component uses `.text-primary`
- **THEN** it SHALL render with `color: #d4d4d4`
- **WHEN** a component uses `.text-muted`
- **THEN** it SHALL render with `color: #888`
- **WHEN** a component uses `.text-small`
- **THEN** it SHALL render with `font-size: 12px`

#### Scenario: Toolbar visibility toggle

- **WHEN** a toolbar element has class `.toolbar`
- **THEN** it SHALL render with `display: flex` and appropriate toolbar styling
- **WHEN** the same element also has class `.hidden`
- **THEN** it SHALL render with `display: none`

### Requirement: Buffer component deduplication

The system SHALL maintain only one canonical location for each buffer component. Byte-identical copies in `domain/buffers/` SHALL be removed and all imports SHALL point to the `web/features/sessions/components/buffers/` location.

#### Scenario: Import resolution after deduplication

- **WHEN** any file imports a buffer component
- **THEN** it SHALL resolve to `web/features/sessions/components/buffers/`
- **AND** no buffer component files SHALL exist in `domain/buffers/`

### Requirement: Inline style elimination

All TSX components SHALL use CSS classes instead of inline `style` attributes for static styling. Dynamic styles that depend on runtime values (e.g., calculated positions, widths) MAY remain inline.

#### Scenario: Static style migration

- **WHEN** a component previously used `style="color: #888; font-size: 12px"`
- **THEN** it SHALL use `className="text-muted text-small"` (or equivalent semantic class)

#### Scenario: Dynamic style preservation

- **WHEN** a component uses `style={{ width: calculatedWidth + 'px' }}`
- **THEN** it MAY continue to use inline style for that dynamic property
