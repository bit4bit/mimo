# Third-Party Licenses

This project (MIMO) is licensed under AGPL-3.0-only. It depends on the following
third-party components with compatible but distinct licenses.

---

## libvips / sharp

**Packages:** `@img/sharp-libvips-linux-x64`, `@img/sharp-libvips-darwin-arm64`, and
related `@img/sharp-*` platform packages (pulled in transitively via the `sharp` npm package).

**License:** LGPL-3.0-or-later

**Nature of dependency:** Optional, dynamically linked native libraries. These are
precompiled shared libraries loaded at runtime by the `sharp` image processing module.
They are NOT statically compiled into the MIMO binaries.

**Source code:** https://github.com/libvips/libvips

**LGPL compliance:** Because libvips is dynamically linked (not statically embedded),
end users retain the freedom to replace the libvips shared library with a modified
version. MIMO does not restrict this ability. The LGPL source code is available at
the link above.

---

## Updating this file

When a new GPL-family dependency is added to the project, update this file to document:

1. The package name(s)
2. The license identifier (e.g. LGPL-3.0-or-later, GPL-2.0-only)
3. Whether it is statically or dynamically linked
4. A link to the upstream source code
