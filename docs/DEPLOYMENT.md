# User Deployment Guide

Non-root user services for Linux (systemd) and macOS (launchd).

## Linux (systemd user services)

### Quick install

From repo root:

```bash
./scripts/install-user-platform.sh --download
./scripts/install-user-agent.sh --download --provider opencode --token <AGENT_JWT>
```

If `~/.local/bin` is not writable, use `--bin-dir "$HOME/bin"` on both commands.

`install-user-agent.sh` supports provider instances (`opencode` or `claude`). If `--provider` or `--token` is omitted, it prompts interactively.

Token is saved to `~/.config/mimo/mimo-agent.env` by the installer.

### Useful commands

```bash
systemctl --user status mimo-platform.service
systemctl --user status mimo-agent@opencode.service
journalctl --user -u mimo-platform.service -f
journalctl --user -u mimo-agent@opencode.service -f
curl http://127.0.0.1:3000/health
```

Optional (start on boot without login):

```bash
sudo loginctl enable-linger "$USER"
```

## macOS (launchd user agents)

### Quick install

From repo root:

```bash
./scripts/install-mac-platform.sh --download
./scripts/install-mac-agent.sh --download --provider opencode --token <AGENT_JWT>
```

Or both at once:

```bash
./scripts/install-mac-services.sh --download --provider opencode --token <AGENT_JWT>
```

Architecture is auto-detected (`darwin-x64` or `darwin-arm64`). If `--provider` or `--token` is omitted, the agent installer prompts interactively. Token is saved per provider to `~/.config/mimo/mimo-agent.<provider>.env` (chmod 600), so each provider has its own JWT.

If `~/.local/bin` is not writable, use `--bin-dir "$HOME/bin"` on both commands.

### Prerequisite for `--provider claude`

The agent spawns `claude-agent-acp` from `PATH`. Install version 0.25.3 or newer:

```bash
npm i -g @agentclientprotocol/claude-agent-acp@0.25.3
```

Older builds (e.g. the homebrew `@zed-industries/claude-agent-acp@0.23.1`) reject `permissions.defaultMode: auto` and fail capability advertisement.

### Differences vs. Linux

- launchd has no equivalent of systemd's `@`-instance templates, so the provider is baked into a per-provider plist: `~/Library/LaunchAgents/com.mimo.agent.opencode.plist` (or `.claude.plist`). Each plist sources its own env file (`~/.config/mimo/mimo-agent.<provider>.env`), so multiple providers can run simultaneously — re-running the installer with a different `--provider` adds it alongside any existing one.
- Logs go to `~/Library/Logs/mimo/mimo-platform.{out,err}.log` and `~/Library/Logs/mimo/mimo-agent.<provider>.{out,err}.log` (no `journalctl` equivalent).
- Services start at login automatically — no `loginctl enable-linger` step.

### Start manually

`launchctl bootstrap` only succeeds if the label is **not** already loaded — otherwise it fails with `Bootstrap failed: 5: Input/output error`. Use `bootout` first to make it idempotent, or use `kickstart` to (re)start an already-loaded service.

```bash
DOMAIN="gui/$(id -u)"

# Idempotent load + start: unload (ignore "not loaded" error) then bootstrap.
launchctl bootout "$DOMAIN/com.mimo.platform" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" ~/Library/LaunchAgents/com.mimo.platform.plist

launchctl bootout "$DOMAIN/com.mimo.agent.opencode" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" ~/Library/LaunchAgents/com.mimo.agent.opencode.plist

# If already loaded and you just want to (re)start it:
launchctl kickstart -k "$DOMAIN/com.mimo.platform"
launchctl kickstart -k "$DOMAIN/com.mimo.agent.opencode"
```

Check whether something is already loaded:

```bash
launchctl print "gui/$(id -u)/com.mimo.platform"
```

Run in the foreground (no launchd, useful for debugging):

```bash
# Sources the env file the same way the plist does.
set -a; . ~/.config/mimo/mimo-platform.env; set +a
~/.local/bin/mimo-platform

# In another terminal:
set -a; . ~/.config/mimo/mimo-agent.opencode.env; set +a
~/.local/bin/mimo-agent --token "$MIMO_AGENT_TOKEN" --platform "$MIMO_AGENT_PLATFORM" --provider opencode
```

### Useful commands

```bash
DOMAIN="gui/$(id -u)"
launchctl print "$DOMAIN/com.mimo.platform"
launchctl print "$DOMAIN/com.mimo.agent.opencode"

tail -F ~/Library/Logs/mimo/mimo-platform.out.log
tail -F ~/Library/Logs/mimo/mimo-agent.opencode.out.log

# Restart after editing ~/.config/mimo/*.env
launchctl kickstart -k "$DOMAIN/com.mimo.platform"
launchctl kickstart -k "$DOMAIN/com.mimo.agent.opencode"

curl http://127.0.0.1:3000/health
```

### Troubleshooting

**`Executable not found in $PATH: "fossil"` (or any Homebrew tool)** — launchd starts services with a minimal `PATH` that doesn't include Homebrew. The shipped plists set `EnvironmentVariables.PATH` to cover `/opt/homebrew/bin` (Apple Silicon) and `/usr/local/bin` (Intel). If you installed before this change, re-run `./scripts/install-mac-platform.sh` to refresh the plist, or manually add a `PATH=...` line to `~/.config/mimo/mimo-platform.env` and `launchctl kickstart -k "gui/$(id -u)/com.mimo.platform"`.

**`Bootstrap failed: 5: Input/output error`** — the label is already loaded. See "Start manually" above for the idempotent `bootout` + `bootstrap` pattern, or just `kickstart -k`.

### Stop / uninstall

```bash
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/com.mimo.platform"
launchctl bootout "$DOMAIN/com.mimo.agent.opencode"

rm ~/Library/LaunchAgents/com.mimo.platform.plist
rm ~/Library/LaunchAgents/com.mimo.agent.opencode.plist
```
