#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Install both user services (platform + agent).

Usage:
  ./scripts/install-user-services.sh [--provider <opencode|claude>] [--download] [--force] [--no-start]

This wrapper runs:
  1) ./scripts/install-user-platform.sh
  2) ./scripts/install-user-agent.sh
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

platform_args=()
agent_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider|--token)
      agent_args+=("$1")
      shift
      [[ $# -gt 0 ]] || { printf 'Missing value for %s\n' "${agent_args[-1]}" >&2; exit 1; }
      agent_args+=("$1")
      ;;
    *)
      platform_args+=("$1")
      agent_args+=("$1")
      ;;
  esac
  shift
done

"$SCRIPT_DIR/install-user-platform.sh" "${platform_args[@]}"
"$SCRIPT_DIR/install-user-agent.sh" "${agent_args[@]}"
