#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
MIMO_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/mimo"
BIN_DIR="${MIMO_BIN_DIR:-$HOME/.local/bin}"

FORCE=0
START=1
COMPILE_ONLY=0
PROVIDER=""
TOKEN=""

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] %s\n' "$(timestamp)" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(timestamp)" "$*" >&2; }
die() { printf '[%s] ERROR: %s\n' "$(timestamp)" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Install mimo-agent as a systemd user service instance by provider.

Usage:
  ./scripts/install-user-agent.sh [--compile-only] [--force] [--no-start] [--provider <opencode|claude>] [--token <jwt>] [--bin-dir <path>]

Options:
  --compile-only  Only compile and copy mimo-agent binary, then exit.
  --force     Overwrite existing ~/.config/mimo/mimo-agent.env.
  --no-start  Do not enable/start the service.
  --provider  Provider to enable (opencode|claude). If omitted, script asks.
  --token     Agent JWT token. If omitted, script asks interactively.
  --bin-dir   Install/read binary from custom directory.
  -h, --help  Show help.
EOF
}

ensure_writable_dir() {
  local dir="$1"
  mkdir -p "$dir"
  [[ -w "$dir" ]] || die "Directory is not writable: $dir"
}

compile_binary() {
  local target="$1"
  local bun_target
  local package_dir="$ROOT_DIR/packages/mimo-agent"

  case "$(uname -m)" in
    x86_64) bun_target="bun-linux-x64" ;;
    *) die "Unsupported architecture for local build: $(uname -m)" ;;
  esac

  command -v bun >/dev/null 2>&1 || die "bun is required to compile from source"
  log "Compiling mimo-agent from local source (${bun_target})"
  [[ -f "$package_dir/src/index.ts" ]] || die "Missing source file: $package_dir/src/index.ts"
  (
    cd "$package_dir"
    bun build --compile --target="$bun_target" ./src/index.ts --outfile "$target"
  )
  chmod +x "$target"
}

validate_provider() {
  case "$1" in
    opencode|claude) return 0 ;;
    *) return 1 ;;
  esac
}

prompt_provider() {
  local answer
  while true; do
    printf 'Select provider to enable [opencode/claude]: '
    read -r answer
    answer="${answer,,}"
    if validate_provider "$answer"; then
      PROVIDER="$answer"
      return
    fi
    warn "Invalid provider: $answer"
  done
}

prompt_token() {
  local answer
  while true; do
    printf 'Enter agent JWT token: '
    read -r answer
    if [[ -n "$answer" ]]; then
      TOKEN="$answer"
      return
    fi
    warn "Token cannot be empty"
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compile-only) COMPILE_ONLY=1 ;;
    --force) FORCE=1 ;;
    --no-start) START=0 ;;
    --provider)
      shift
      [[ $# -gt 0 ]] || die "Missing value for --provider"
      PROVIDER="${1,,}"
      ;;
    --token)
      shift
      [[ $# -gt 0 ]] || die "Missing value for --token"
      TOKEN="$1"
      ;;
    --bin-dir)
      shift
      [[ $# -gt 0 ]] || die "Missing value for --bin-dir"
      BIN_DIR="$1"
      ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
  shift
done

[[ "$(uname -s)" == "Linux" ]] || die "Linux/systemd only"

ensure_writable_dir "$BIN_DIR"
log "Directories ready (bin: $BIN_DIR)"

compile_binary "$BIN_DIR/mimo-agent"
[[ -x "$BIN_DIR/mimo-agent" ]] || die "Missing $BIN_DIR/mimo-agent after local build"

if [[ "$COMPILE_ONLY" -eq 1 ]]; then
  log "Compile-only mode complete"
  cat <<EOF
Done.
Binary: $BIN_DIR/mimo-agent
EOF
  exit 0
fi

mkdir -p "$SYSTEMD_USER_DIR" "$MIMO_CONFIG_DIR"

if [[ -n "$PROVIDER" ]] && ! validate_provider "$PROVIDER"; then
  die "Unknown provider: $PROVIDER"
fi

if [[ -z "$PROVIDER" ]]; then
  if [[ -t 0 ]]; then
    prompt_provider
  else
    die "No provider selected. Use --provider opencode|claude"
  fi
fi

log "Selected provider: $PROVIDER"

if [[ -z "$TOKEN" ]]; then
  if [[ -t 0 ]]; then
    prompt_token
  else
    die "No token provided. Use --token <jwt>"
  fi
fi

cp "$ROOT_DIR/deploy/systemd/user/mimo-agent@.service" "$SYSTEMD_USER_DIR/mimo-agent@.service"
if [[ "$BIN_DIR" != "$HOME/.local/bin" ]]; then
  sed -i "s|ExecStart=%h/.local/bin/mimo-agent |ExecStart=$BIN_DIR/mimo-agent |" "$SYSTEMD_USER_DIR/mimo-agent@.service"
fi
log "Installed mimo-agent@.service"

AGENT_ENV="$MIMO_CONFIG_DIR/mimo-agent.env"
if [[ "$FORCE" -eq 1 || ! -f "$AGENT_ENV" ]]; then
  cp "$ROOT_DIR/deploy/systemd/user/mimo-agent.env.example" "$AGENT_ENV"
  log "Wrote $AGENT_ENV"
fi

if grep -q '^MIMO_AGENT_TOKEN=' "$AGENT_ENV"; then
  sed -i "s|^MIMO_AGENT_TOKEN=.*|MIMO_AGENT_TOKEN=$TOKEN|" "$AGENT_ENV"
else
  printf '\nMIMO_AGENT_TOKEN=%s\n' "$TOKEN" >> "$AGENT_ENV"
fi
log "Saved token in $AGENT_ENV"

chmod 600 "$AGENT_ENV"

systemctl --user daemon-reload
log "Reloaded systemd user daemon"

if [[ "$START" -eq 1 ]]; then
  systemctl --user disable --now mimo-agent.service >/dev/null 2>&1 || true
  for other in opencode claude; do
    if [[ "$other" != "$PROVIDER" ]]; then
      systemctl --user disable --now "mimo-agent@${other}.service" >/dev/null 2>&1 || true
    fi
  done
  systemctl --user enable --now "mimo-agent@${PROVIDER}.service"
  log "Enabled and started mimo-agent@${PROVIDER}.service"
else
  log "Skipped start (--no-start)"
fi

cat <<EOF
Done.
Service: mimo-agent@${PROVIDER}.service
Env: $AGENT_ENV
Check: systemctl --user status mimo-agent@${PROVIDER}.service
Logs: journalctl --user -u mimo-agent@${PROVIDER}.service -f
EOF
