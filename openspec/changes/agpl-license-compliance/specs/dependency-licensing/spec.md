## ADDED Requirements

### Requirement: LGPL dependencies are documented

The project SHALL maintain a `THIRD-PARTY-LICENSES.md` file documenting all LGPL-3.0-or-later dependencies.

#### Scenario: Document libvips dependency

- **WHEN** a user reads `THIRD-PARTY-LICENSES.md`
- **THEN** it MUST list the `libvips` library (via `@img/sharp-libvips-*` packages) as LGPL-3.0-or-later
- **AND** it MUST state that these are optional, dynamically linked native libraries
- **AND** it MUST include a link to the libvips source code

#### Scenario: Dependency license changes

- **WHEN** a new GPL-family dependency is added to the project
- **THEN** `THIRD-PARTY-LICENSES.md` MUST be updated to document it
