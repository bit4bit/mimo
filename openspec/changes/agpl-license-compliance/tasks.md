## 1. SPDX License Headers

- [x] 1.1 Create `scripts/add-license-headers.sh` to bulk-add `// SPDX-License-Identifier: AGPL-3.0-only` to all `.ts`/`.tsx` files in `packages/*/src/`
- [x] 1.2 Create `scripts/verify-license-headers.sh` to check all source files have SPDX headers (exit 1 if any missing)
- [x] 1.3 Run the add script to apply headers to all existing source files
- [x] 1.4 Add verify script to CI workflow or pre-commit check

## 2. Release Compliance

- [x] 2.1 Update `.github/workflows/release.yml` to attach `LICENSE` file to draft GitHub Release
- [x] 2.2 Update release workflow to include source repository link in release notes body
- [x] 2.3 Test release workflow on a pre-release tag to verify LICENSE attachment

## 3. Third-Party License Documentation

- [x] 3.1 Create `THIRD-PARTY-LICENSES.md` at repository root documenting libvips/sharp LGPL dependencies
- [x] 3.2 Include libvips source code link and dynamic linking explanation
- [x] 3.3 Reference `THIRD-PARTY-LICENSES.md` from main `README.md`

## 4. Verification

- [x] 4.1 Run `scripts/verify-license-headers.sh` and confirm zero failures
- [x] 4.2 Review `THIRD-PARTY-LICENSES.md` for accuracy
- [x] 4.3 Confirm release workflow YAML syntax is valid
- [ ] 4.4 Commit all changes and verify no runtime impact
