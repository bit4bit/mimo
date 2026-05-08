#!/usr/bin/env bash
# Verifies all .ts/.tsx files in packages/*/src/ have SPDX-License-Identifier header.
# Exits 1 if any files are missing the header.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MISSING=0

while IFS= read -r file; do
  if ! head -1 "$file" | grep -qF "SPDX-License-Identifier"; then
    echo "  missing: ${file#"$ROOT/"}"
    MISSING=$((MISSING + 1))
  fi
done < <(find "$ROOT/packages" \( -path "*/src/*.ts" -o -path "*/src/*.tsx" \) -not -path "*/node_modules/*" | sort)

if [ "$MISSING" -gt 0 ]; then
  echo ""
  echo "Error: $MISSING file(s) missing SPDX-License-Identifier header."
  echo "Run scripts/add-license-headers.sh to fix."
  exit 1
else
  echo "All source files have SPDX-License-Identifier header."
fi
