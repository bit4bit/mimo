## Why

The project is explicitly licensed under AGPL-3.0-only, but currently lacks several compliance best practices: source files have no SPDX license identifiers, the release workflow does not attach the LICENSE file to compiled binaries, and LGPL dependency compliance is not documented. This change addresses these gaps to ensure full AGPLv3 compliance.

## What Changes

- Add SPDX-License-Identifier headers to all TypeScript source files in both packages
- Update the GitHub Actions release workflow to include the full LICENSE file and source code reference in release artifacts
- Create a `THIRD-PARTY-LICENSES.md` documenting LGPL-3.0-or-later dependencies (libvips/sharp)
- Add a compliance verification script that checks source files have SPDX headers

## Capabilities

### New Capabilities

- `license-headers`: Automated SPDX license identifier management for source files
- `release-compliance`: AGPL-compliant release artifact bundling with license notices
- `dependency-licensing`: Third-party license documentation and LGPL compliance tracking

### Modified Capabilities

- (none - no existing spec-level behavior changes)

## Impact

- All `.ts` and `.tsx` source files in `packages/mimo-platform/src/` and `packages/mimo-agent/src/`
- `.github/workflows/release.yml` - release workflow modification
- New files: `THIRD-PARTY-LICENSES.md`, `scripts/verify-license-headers.sh`
- No breaking changes to APIs or runtime behavior
