#!/bin/sh
set -eu

echo "[init-agent] Preparing runtime tools for provider: ${AGENT_PROVIDER:-opencode}"

install_opencode_wrapper() {
  wrapper_path="$HOME/.local/bin/opencode"

  cat > "$wrapper_path" <<EOF
#!/bin/sh
exec bunx --bun opencode-ai "\$@"
EOF
  chmod +x "$wrapper_path"
}

install_claude() {
  if command -v claude >/dev/null 2>&1; then
    echo "[init-agent] Claude Code already installed"
    return 0
  fi

  echo "[init-agent] Installing Claude Code CLI..."
  curl -fsSL https://claude.ai/install.sh | bash
}

install_claude_agent_acp_wrapper() {
  wrapper_path="$HOME/.local/bin/claude-agent-acp"
  local_bin="/app/packages/mimo-agent/node_modules/.bin/claude-agent-acp"

  if [ -x "$local_bin" ]; then
    ln -sf "$local_bin" "$wrapper_path"
  else
    echo "[init-agent] claude-agent-acp not found at $local_bin"
    exit 1
  fi
}

ensure_openspec_installed() {
  npm install -g @fission-ai/openspec@latest
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

AGENT_PROVIDER="${AGENT_PROVIDER:-opencode}"

if [ "$AGENT_PROVIDER" = "opencode" ]; then
  install_opencode_wrapper
  ensure_openspec_installed
  warm_command "opencode"
  warm_command "openspec"
  require_command "opencode"
  require_command "openspec"
elif [ "$AGENT_PROVIDER" = "claude" ]; then
  install_claude
  install_claude_agent_acp_wrapper
  warm_command "claude"
  warm_command "claude-agent-acp"
  require_command "claude"
  require_command "claude-agent-acp"
fi

echo "[init-agent] PATH=$PATH"
echo "[init-agent] Done"

exec bun run src/index.ts --token "${AGENT_JWT}" --platform "ws://platform:${PORT}/ws/agent" --provider "${AGENT_PROVIDER}" --workdir /home/app/.mimo-agent
