#!/bin/sh
set -eu

echo "[init-agent] Preparing runtime tools"

install_wrapper() {
  name="$1"
  target="$2"
  wrapper_path="$HOME/.local/bin/$name"

  cat > "$wrapper_path" <<EOF
#!/bin/sh
exec bunx --bun $target "\$@"
EOF
  chmod +x "$wrapper_path"
}

warm_command() {
  cmd="$1"
  "$cmd" --version >/dev/null 2>&1 || true
}

require_command() {
  cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "[init-agent] $cmd not found on PATH"
    exit 1
  }
}

mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"

install_wrapper "opencode" "opencode-ai"
install_wrapper "openspec" "@fission-ai/openspec"

warm_command "opencode"
warm_command "openspec"

echo "[init-agent] PATH=$PATH"
require_command "opencode"
require_command "openspec"

echo "[init-agent] Done"

exec bun run src/index.ts --token "${OPENCODE_AGENT_JWT}" --platform "ws://platform:${PORT}/ws/agent" --provider opencode --workdir /home/app/.mimo-agent
