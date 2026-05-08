#!/usr/bin/env bash
# Adds SPDX-License-Identifier header to all .ts/.tsx files in packages/*/src/
# that are missing it. Safe to run multiple times (idempotent).

set -euo pipefail

HEADER="// SPDX-License-Identifier: AGPL-3.0-only"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADDED=0
SKIPPED=0

while IFS= read -r file; do
  if head -1 "$file" | grep -qF "SPDX-License-Identifier"; then
    SKIPPED=$((SKIPPED + 1))
  else
    tmp="$(mktemp)"
    { echo "$HEADER"; cat "$file"; } > "$tmp"
    mv "$tmp" "$file"
    echo "  added: ${file#"$ROOT/"}"
    ADDED=$((ADDED + 1))
  fi
done < <(find "$ROOT/packages" \( -path "*/src/*.ts" -o -path "*/src/*.tsx" \) -not -path "*/node_modules/*" | sort)

echo ""
echo "Done: $ADDED file(s) updated, $SKIPPED already had header."
