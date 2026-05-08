## Context

The MIMO project is licensed under AGPL-3.0-only across all packages. Current gaps in compliance include: missing SPDX license identifiers in source files, release binaries that don't include license notices, and undocumented LGPL-3.0-or-later dependencies. This change implements automated compliance without disrupting development workflows.

## Goals / Non-Goals

**Goals:**

- Ensure every source file has a clear SPDX license identifier
- Make release artifacts include AGPL license notices per Section 6
- Document third-party LGPL dependencies and their compliance requirements
- Provide automated verification to prevent regression

**Non-Goals:**

- Changing the project's license or adding copyright assignment
- Modifying runtime behavior or APIs
- Full license audit of all transitive dependencies (only address known LGPL dependencies)

## Decisions

**Decision: Use SPDX short-form identifiers instead of full license headers**

- Rationale: SPDX headers (`// SPDX-License-Identifier: AGPL-3.0-only`) are concise, machine-readable, and the modern standard. Full headers would clutter every file and are harder to maintain.
- Alternative considered: Full license header blocks - rejected due to verbosity and maintenance overhead.

**Decision: Add headers via script rather than pre-commit hook**

- Rationale: Pre-commit hooks can be bypassed. A dedicated script allows bulk application and CI verification.
- Alternative considered: Pre-commit hook - rejected because hooks are not enforced in CI.

**Decision: Bundle LICENSE into release artifacts via GitHub Actions**

- Rationale: AGPL Section 6 requires distributing the license with object code. GitHub Actions can attach the LICENSE file to each release automatically.
- Alternative considered: Embedding license in binary - rejected as Bun's compile doesn't support easy text embedding of arbitrary files.

**Decision: Create THIRD-PARTY-LICENSES.md instead of per-dependency files**

- Rationale: Single consolidated file is easier to maintain and discover than scattered notices.

## Risks / Trade-offs

**Risk: SPDX headers add noise to small files** → Mitigation: Use single-line comments, only apply to `.ts`/`.tsx` files (not config or JSON).

**Risk: Release workflow changes could break existing release process** → Mitigation: Test workflow on a pre-release tag before merging.

**Risk: LGPL compliance for distributed binaries with libvips** → Mitigation: Document that LGPL components are dynamically linked and provide source attribution in THIRD-PARTY-LICENSES.md.
