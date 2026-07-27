## ADDED Requirements

### Requirement: Project favicon is derived from project identity

The system SHALL render a per-project browser-tab favicon, derived deterministically from the project's `id` (for hue) and `name` (for glyph), on every page that is bound to a project. The same project MUST produce the same favicon across tabs, sessions, reloads, and machines, without persisting any new state.

#### Scenario: Session page for a project renders the project favicon

- **WHEN** a user opens a session page for project with id `p-123` and name `my-cool-project`
- **THEN** the rendered HTML `<head>` contains a `<link rel="icon">` whose `href` is a `data:image/svg+xml` URI
- **AND** the SVG background fill is `hsl(hash("p-123") % 360, 65%, 52%)`
- **AND** the SVG text content is the first grapheme of `my-cool-project`, uppercased

#### Scenario: Same project always produces the same favicon

- **WHEN** the favicon for project id `p-123` / name `my-cool-project` is generated twice in independent processes
- **THEN** both generated data URIs are byte-identical

#### Scenario: Different projects produce different hues

- **WHEN** favicons are generated for two distinct project ids `p-123` and `p-456`
- **THEN** the two background hues MAY differ
- **AND** neither favicon is byte-identical to the other

### Requirement: Pages without an active project render a default favicon

The system SHALL render a default MIMO favicon on pages that have no active project context (dashboard, project list, auth pages, error pages). The default favicon MUST NOT depend on any project.

#### Scenario: Dashboard page renders default favicon

- **WHEN** a user opens the dashboard page with no project context
- **THEN** the rendered HTML `<head>` contains a `<link rel="icon">` pointing at the default MIMO favicon
- **AND** the favicon does not vary by any project id or name

### Requirement: Favicon text color preserves contrast against its background

The system SHALL choose the favicon glyph color (white `#ffffff` or near-black `#1a1a1a`) based on the luminance of the derived background color, so that the glyph remains legible against the background.

#### Scenario: Light background uses dark text

- **WHEN** the derived hue yields a background whose relative luminance is greater than `0.6`
- **THEN** the SVG text fill is `#1a1a1a`

#### Scenario: Dark background uses light text

- **WHEN** the derived hue yields a background whose relative luminance is less than or equal to `0.6`
- **THEN** the SVG text fill is `#ffffff`

### Requirement: Empty project name produces a safe fallback glyph

The system SHALL render a fallback glyph (a filled circle) when a project's `name` is empty or contains no usable grapheme, rather than crashing or rendering blank.

#### Scenario: Project with empty name

- **WHEN** a favicon is generated for a project whose `name` is `""`
- **THEN** the SVG contains a fallback shape (filled circle) in the foreground color
- **AND** no text element with empty content is emitted

### Requirement: Favicon generation is pure and side-effect-free

The system SHALL implement favicon generation as pure functions that take project identity as input and return a data URI string, with no I/O, no globals, and no hidden state. The generator MUST be usable both from the server-side render path and from unit tests without any environment setup.

#### Scenario: Generating a favicon does not touch the filesystem or network

- **WHEN** the favicon generator is invoked with `{id: "p-1", name: "alpha"}`
- **THEN** it returns a string of the form `data:image/svg+xml,...`
- **AND** no file is read or written and no network call is made