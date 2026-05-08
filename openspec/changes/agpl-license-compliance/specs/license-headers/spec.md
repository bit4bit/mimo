## ADDED Requirements

### Requirement: Source files contain SPDX license identifier

All TypeScript source files SHALL contain an SPDX-License-Identifier comment at the top of the file.

#### Scenario: New source file created

- **WHEN** a developer creates a new `.ts` or `.tsx` file in `packages/*/src/`
- **THEN** the file MUST contain `// SPDX-License-Identifier: AGPL-3.0-only` as the first line

#### Scenario: Verification script run

- **WHEN** the license header verification script is executed
- **THEN** it SHALL report any `.ts` or `.tsx` files in `packages/*/src/` missing the SPDX identifier

#### Scenario: Bulk application script run

- **WHEN** the license header application script is executed
- **THEN** it SHALL add the SPDX identifier to all `.ts` and `.tsx` files in `packages/*/src/` that are missing it
