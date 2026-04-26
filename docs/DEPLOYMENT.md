# User Deployment Guide

Linux only, non-root, systemd user services.

## Quick install

From repo root:

```bash
./scripts/install-user-platform.sh --download
./scripts/install-user-agent.sh --download --provider opencode --token <AGENT_JWT>
```

If `~/.local/bin` is not writable, use `--bin-dir "$HOME/bin"` on both commands.

`install-user-agent.sh` supports provider instances (`opencode` or `claude`). If `--provider` or `--token` is omitted, it prompts interactively.

Token is saved to `~/.config/mimo/mimo-agent.env` by the installer.

## Useful commands

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
