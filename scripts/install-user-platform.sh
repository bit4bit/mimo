#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
MIMO_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/mimo"
BIN_DIR="${MIMO_BIN_DIR:-$HOME/.local/bin}"

FORCE=0
START=1

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] %s\n' "$(timestamp)" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(timestamp)" "$*" >&2; }
die() { printf '[%s] ERROR: %s\n' "$(timestamp)" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Install mimo-platform as a systemd user service.

Usage:
  ./scripts/install-user-platform.sh [--force] [--no-start] [--bin-dir <path>]

Options:
  --force     Overwrite existing ~/.config/mimo/mimo-platform.env.
  --no-start  Do not enable/start the service.
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
  local package_dir="$ROOT_DIR/packages/mimo-platform"

  case "$(uname -m)" in
    x86_64) bun_target="bun-linux-x64" ;;
    *) die "Unsupported architecture for local build: $(uname -m)" ;;
  esac

  command -v bun >/dev/null 2>&1 || die "bun is required to compile from source"
  log "Compiling mimo-platform from local source (${bun_target})"
  [[ -f "$package_dir/src/index.tsx" ]] || die "Missing source file: $package_dir/src/index.tsx"
  [[ -f "$package_dir/src/assets.ts" ]] || die "Missing source file: $package_dir/src/assets.ts"
  (
    cd "$package_dir"
    bun build --compile --target="$bun_target" ./src/index.tsx ./src/assets.ts --outfile "$target"
  )
  chmod +x "$target"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1 ;;
    --no-start) START=0 ;;
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

mkdir -p "$SYSTEMD_USER_DIR" "$MIMO_CONFIG_DIR"
ensure_writable_dir "$BIN_DIR"
log "Directories ready (bin: $BIN_DIR)"

compile_binary "$BIN_DIR/mimo-platform"

[[ -x "$BIN_DIR/mimo-platform" ]] || die "Missing $BIN_DIR/mimo-platform after local build"

cp "$ROOT_DIR/deploy/systemd/user/mimo-platform.service" "$SYSTEMD_USER_DIR/mimo-platform.service"
if [[ "$BIN_DIR" != "$HOME/.local/bin" ]]; then
  sed -i "s|ExecStart=%h/.local/bin/mimo-platform|ExecStart=$BIN_DIR/mimo-platform|" "$SYSTEMD_USER_DIR/mimo-platform.service"
fi
log "Installed mimo-platform.service"

PLATFORM_ENV="$MIMO_CONFIG_DIR/mimo-platform.env"
if [[ "$FORCE" -eq 1 || ! -f "$PLATFORM_ENV" ]]; then
  cp "$ROOT_DIR/deploy/systemd/user/mimo-platform.env.example" "$PLATFORM_ENV"
  log "Wrote $PLATFORM_ENV"
fi

chmod 600 "$PLATFORM_ENV"

if grep -q 'replace-with-a-strong-random-secret' "$PLATFORM_ENV"; then
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -base64 32 | tr -d '\n')"
    sed -i "s|replace-with-a-strong-random-secret|$SECRET|g" "$PLATFORM_ENV"
    log "Generated JWT_SECRET"
  else
    warn "openssl missing; set JWT_SECRET manually in $PLATFORM_ENV"
  fi
fi

systemctl --user daemon-reload
log "Reloaded systemd user daemon"

if [[ "$START" -eq 1 ]]; then
  systemctl --user enable --now mimo-platform.service
  log "Enabled and started mimo-platform.service"
else
  log "Skipped start (--no-start)"
fi

cat <<EOF
Done.
Service: mimo-platform.service
Env: $PLATFORM_ENV
Check: systemctl --user status mimo-platform.service
Logs: journalctl --user -u mimo-platform.service -f
EOF
