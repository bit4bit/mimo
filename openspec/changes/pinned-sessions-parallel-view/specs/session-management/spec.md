## ADDED Requirements

### Requirement: Session page embed mode

The session page SHALL support an embed mode, activated by the `embed=1` URL query flag, that suppresses layout chrome so the page can be rendered inside a same-origin iframe at narrow widths.

#### Scenario: Embed flag suppresses chrome

- **WHEN** the session page is requested with `?embed=1`
- **THEN** system renders the page without the global top-nav, without the session footer actions bar, and without the keyboard shortcuts bar
- **AND** the two-frame buffer layout and all buffer functionality remain intact

#### Scenario: Embed mode defaults the right frame to collapsed

- **WHEN** the session page is requested with `?embed=1`
- **AND** no explicit frame-state preference is otherwise persisted for this session
- **THEN** system renders the right frame in the collapsed state on initial load

#### Scenario: Embed mode suppresses pin affordances

- **WHEN** the session page is requested with `?embed=1`
- **THEN** system does not render the pin checkbox in the top-nav
- **AND** system does not render the pinned-sessions side-menu (`[≡]`) button

#### Scenario: Non-embed rendering is unchanged

- **WHEN** the session page is requested without the `embed` flag
- **THEN** system renders the page with the full top-nav, footer actions bar, shortcuts bar, pin checkbox, and side-menu button as applicable