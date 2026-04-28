#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
MIMO_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/mimo"
LOG_DIR="$HOME/Library/Logs/mimo"
BIN_DIR="${MIMO_BIN_DIR:-$HOME/.local/bin}"

LABEL_PREFIX="com.mimo.agent"
PROVIDERS=(opencode claude)

FORCE=0
START=1
DOWNLOAD=0
PROVIDER=""
TOKEN=""

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] %s\n' "$(timestamp)" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(timestamp)" "$*" >&2; }
die() { printf '[%s] ERROR: %s\n' "$(timestamp)" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Install mimo-agent as a launchd user agent (macOS), one plist per provider.

Usage:
  ./scripts/install-mac-agent.sh [--download] [--force] [--no-start] [--provider <opencode|claude>] [--token <jwt>] [--bin-dir <path>]

Options:
  --download  Download release binary to ~/.local/bin.
  --force     Overwrite existing ~/.config/mimo/mimo-agent.env.
  --no-start  Do not load/start the launch agent.
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

download_binary() {
  local url="$1"
  local target="$2"
  local tmp
  tmp="$(mktemp "${target}.tmp.XXXXXX")"
  if ! curl -fL --progress-bar -o "$tmp" "$url"; then
    rm -f "$tmp"
    die "Download failed for $url (check permissions and free disk space)"
  fi
  chmod +x "$tmp"
  mv "$tmp" "$target"
}

to_lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

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
    answer="$(to_lower "$answer")"
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

install_local_binary() {
  local target="$1"
  shift
  local src
  for src in "$@"; do
    if [[ -x "$src" ]]; then
      cp "$src" "$target"
      chmod +x "$target"
      return 0
    fi
  done
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --download) DOWNLOAD=1 ;;
    --force) FORCE=1 ;;
    --no-start) START=0 ;;
    --provider)
      shift
      [[ $# -gt 0 ]] || die "Missing value for --provider"
      PROVIDER="$(to_lower "$1")"
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

[[ "$(uname -s)" == "Darwin" ]] || die "macOS/launchd only"

if [[ -n "$PROVIDER" ]] && ! validate_provider "$PROVIDER"; then
  die "Unknown provider: $PROVIDER"
fi

# If --provider not given, try to detect from an already-installed plist
# (refresh case: user just wants to apply template/PATH changes).
if [[ -z "$PROVIDER" ]]; then
  detected=()
  for p in "${PROVIDERS[@]}"; do
    [[ -f "$LAUNCH_AGENTS_DIR/${LABEL_PREFIX}.${p}.plist" ]] && detected+=("$p")
  done
  if [[ ${#detected[@]} -eq 1 ]]; then
    PROVIDER="${detected[0]}"
    log "Detected installed provider: $PROVIDER"
  fi
fi

if [[ -z "$PROVIDER" ]]; then
  if [[ -t 0 ]]; then
    prompt_provider
  else
    die "No provider selected. Use --provider opencode|claude"
  fi
fi

log "Selected provider: $PROVIDER"

# If --token not given, reuse the token already saved in the env file.
AGENT_ENV="$MIMO_CONFIG_DIR/mimo-agent.${PROVIDER}.env"
if [[ -z "$TOKEN" && -f "$AGENT_ENV" ]]; then
  existing_token="$(grep '^MIMO_AGENT_TOKEN=' "$AGENT_ENV" | head -1 | cut -d= -f2-)"
  if [[ -n "$existing_token" && "$existing_token" != "replace-with-agent-jwt-token" ]]; then
    TOKEN="$existing_token"
    log "Reusing existing token from $AGENT_ENV"
  fi
fi

if [[ -z "$TOKEN" ]]; then
  if [[ -t 0 ]]; then
    prompt_token
  else
    die "No token provided. Use --token <jwt>"
  fi
fi

mkdir -p "$LAUNCH_AGENTS_DIR" "$MIMO_CONFIG_DIR" "$LOG_DIR"
ensure_writable_dir "$BIN_DIR"
log "Directories ready (bin: $BIN_DIR, logs: $LOG_DIR)"

if [[ "$DOWNLOAD" -eq 1 ]]; then
  case "$(uname -m)" in
    x86_64) TARGET="darwin-x64" ;;
    arm64) TARGET="darwin-arm64" ;;
    *) die "Unsupported architecture for release download: $(uname -m)" ;;
  esac
  log "Downloading mimo-agent (${TARGET})"
  download_binary "https://github.com/bit4bit/mimo/releases/latest/download/mimo-agent-${TARGET}" "$BIN_DIR/mimo-agent"
else
  if [[ ! -x "$BIN_DIR/mimo-agent" ]]; then
    log "Trying local mimo-agent binaries"
    install_local_binary "$BIN_DIR/mimo-agent" \
      "$ROOT_DIR/mimo-agent" \
      "$ROOT_DIR/packages/mimo-agent/dist/mimo-agent" || true
  fi
fi

[[ -x "$BIN_DIR/mimo-agent" ]] || die "Missing $BIN_DIR/mimo-agent (use --download)"

PLIST_SRC="$ROOT_DIR/deploy/launchd/user/com.mimo.agent.plist"
[[ -f "$PLIST_SRC" ]] || die "Missing template: $PLIST_SRC"

LABEL="${LABEL_PREFIX}.${PROVIDER}"
PLIST_DST="$LAUNCH_AGENTS_DIR/${LABEL}.plist"

cp "$PLIST_SRC" "$PLIST_DST"
sed -i '' "s|__PROVIDER__|$PROVIDER|g" "$PLIST_DST"
sed -i '' "s|__BIN__|$BIN_DIR|g" "$PLIST_DST"
sed -i '' "s|__LOG_DIR__|$LOG_DIR|g" "$PLIST_DST"
log "Installed $PLIST_DST"

if [[ "$FORCE" -eq 1 || ! -f "$AGENT_ENV" ]]; then
  cp "$ROOT_DIR/deploy/systemd/user/mimo-agent.env.example" "$AGENT_ENV"
  log "Wrote $AGENT_ENV"
fi

if grep -q '^MIMO_AGENT_TOKEN=' "$AGENT_ENV"; then
  sed -i '' "s|^MIMO_AGENT_TOKEN=.*|MIMO_AGENT_TOKEN=$TOKEN|" "$AGENT_ENV"
else
  printf '\nMIMO_AGENT_TOKEN=%s\n' "$TOKEN" >> "$AGENT_ENV"
fi
log "Saved token in $AGENT_ENV"

chmod 600 "$AGENT_ENV"

DOMAIN="gui/$(id -u)"

# bootout by plist path (more reliable than by label) and ignore "not loaded".
launchctl bootout "$DOMAIN" "$PLIST_DST" >/dev/null 2>&1 || true

bootstrap_with_retry() {
  # launchctl bootstrap occasionally returns "Bootstrap failed: 5: Input/output error"
  # immediately after a bootout or fresh plist write because bootout is async and
  # the plist-cache lookup can race. A brief retry resolves it.
  local attempt
  for attempt in 1 2 3; do
    if launchctl bootstrap "$DOMAIN" "$PLIST_DST" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  # Final attempt without suppressing stderr so the user sees the real error.
  launchctl bootstrap "$DOMAIN" "$PLIST_DST"
}

if [[ "$START" -eq 1 ]]; then
  bootstrap_with_retry
  launchctl kickstart -k "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  log "Loaded and started $LABEL"
else
  log "Skipped start (--no-start)"
fi

cat <<EOF
Done.
Service: $LABEL
Plist: $PLIST_DST
Env: $AGENT_ENV
Logs: $LOG_DIR/mimo-agent.${PROVIDER}.{out,err}.log
Check: launchctl print $DOMAIN/$LABEL
Tail logs: tail -F $LOG_DIR/mimo-agent.${PROVIDER}.out.log
Stop: launchctl bootout $DOMAIN/$LABEL
EOF
