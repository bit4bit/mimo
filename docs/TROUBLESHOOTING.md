# Troubleshooting Guide

This guide helps diagnose and fix common issues with MIMO Platform.

## Quick Diagnostics

### Check Platform Health

```bash
curl http://localhost:3000/health
# Expected: {"status":"healthy"}
```

### Check Running Processes

```bash
# Platform server
ps aux | grep "bun.*mimo-platform"

# Fossil servers
ps aux | grep fossil

# Agent processes
ps aux | grep mimo-agent
```

### Check Logs

**Systemd**:
```bash
sudo journalctl -u mimo -n 100 -f
```

**Docker**:
```bash
docker logs mimo-container-name
```

**Direct**:
```bash
# In the terminal where you started the server
cd packages/mimo-platform
bun run dev 2>&1 | tee mimo.log
```

## Common Issues

### Platform Won't Start

**Symptom**: `Error: Port 3000 is already in use`

**Solution**:
```bash
# Find and kill process
sudo lsof -i :3000
sudo kill -9 <PID>

# Or use different port
PORT=3001 bun run dev
```

**Symptom**: `Error: JWT_SECRET not set`

**Solution**:
```bash
export JWT_SECRET=$(openssl rand -base64 32)
# Or add to .env file
echo "JWT_SECRET=$(openssl rand -base64 32)" > .env
```

---

### Cannot Log In / Register

**Symptom**: "Invalid credentials" or 401 errors

**Check**:
1. JWT_SECRET is set and consistent
2. User data exists in `~/.mimo/users/`
3. Password was hashed correctly

**Fix**:
```bash
# Reset a user's password manually
cd packages/mimo-platform
bun run -e "
const { userRepository } = require('./src/auth/user.js');
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash('newpassword', 10);
await userRepository.updatePassword('username', hash);
console.log('Password updated');
"
```

---

### Agent Won't Start

**Symptom**: "Agent failed to start" message in chat

**Checklist**:
1. mimo-agent binary exists: `ls packages/mimo-agent/dist/mimo-agent`
2. Binary is executable: `chmod +x packages/mimo-agent/dist/mimo-agent`
3. MIMO_AGENT_PATH environment variable is correct
4. Platform can spawn processes (not in restricted container)

**Debug**:
```bash
# Test agent manually
./packages/mimo-agent/dist/mimo-agent \
  --token test-token \
  --platform ws://localhost:3000/ws/agent
```

**Agent crashes immediately**:
- Check agent stderr in browser console
- Look for missing dependencies
- Verify Bun version: `bun --version` (need 1.0+)

---

### File Changes Not Detected

**Symptom**: Changes made by agent don't appear in Changes buffer

**Checklist**:
1. Agent is connected (check agent status)
2. File watcher is active (check agent logs)
3. Files are in the correct directory (session worktree)

**Debug agent file watcher**:
```bash
# Enable debug mode
DEBUG=1 ./mimo-agent --token ... --platform ...
```

**Check file watcher limits**:
```bash
# Linux: Check inotify limits
cat /proc/sys/fs/inotify/max_user_watches
# Increase if needed:
echo 524288 | sudo tee /proc/sys/fs/inotify/max_user_watches
```

---

### WebSocket Connection Failed

**Symptom**: "WebSocket connection failed" in browser console

**Checklist**:
1. Platform is running
2. Firewall allows WebSocket connections
3. Proxy (nginx) supports WebSocket upgrade
4. JWT token is valid

**Nginx fix**:
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

---

### Cannot Import Git Repository

**Symptom**: "Failed to import from Git" error

**Checklist**:
1. Git is installed: `git --version`
2. Fossil is installed: `fossil version`
3. Repository URL is valid and accessible
4. Network access to Git repository

**Test manually**:
```bash
fossil import --git https://github.com/user/repo.git /tmp/test.fossil
```

---

### Commit/Push Fails

**Symptom**: "Push failed" or "Commit failed"

**Checklist**:
1. Changes exist: `fossil changes` in session worktree
2. Fossil repo is valid: `fossil status`
3. Remote is configured: `fossil remote-url`
4. Network connectivity to remote

**Manual commit**:
```bash
cd ~/.mimo/projects/{id}/sessions/{id}/worktree
fossil commit -m "test message"
fossil push
```

---

### Sync Conflicts

**Symptom**: Files show [!] conflict marker

**Resolution**:
1. Check conflicted files in Changes buffer
2. Use Sync API to resolve:
   ```bash
   curl -X POST http://localhost:3000/sync/{sessionId}/resolve \
     -H "Cookie: token=YOUR_JWT" \
     -H "Content-Type: application/json" \
     -d '{"filePath":"src/app.js","resolution":"session"}'
   ```

3. Or manually resolve and mark as clean via API

---

### Chat Messages Not Appearing

**Symptom**: Messages sent but not displayed

**Checklist**:
1. WebSocket connected (check browser console)
2. Session ID is correct in URL
3. JSONL file is writable: `~/.mimo/projects/{id}/sessions/{id}/chat.jsonl`
4. Disk space available

**Check chat file**:
```bash
tail -20 ~/.mimo/projects/{id}/sessions/{id}/chat.jsonl
```

---

### High Memory Usage

**Symptom**: Platform using too much memory

**Possible Causes**:
1. Too many open sessions
2. Large chat histories loaded into memory
3. File watchers on large directories

**Solutions**:
```bash
# Close old sessions via API
curl -X POST http://localhost:3000/sessions/{id}/close \
  -H "Cookie: token=YOUR_JWT"

# Limit session retention
# Set SESSION_MAX_AGE in .env

# Restart platform
pkill -f "bun.*mimo"
bun run dev
```

---

## Performance Issues

### Slow File Sync

**Cause**: Large repositories or many files

**Solutions**:
1. Exclude large directories in agent (.gitignore style)
2. Increase debounce delay in agent code
3. Use SSD for data directory

### Slow Chat Loading

**Cause**: Large chat history

**Solutions**:
1. Archive old chats periodically
2. Implement pagination (not yet implemented)
3. Rotate chat.jsonl files

### Fossil Server Slow

**Cause**: Too many concurrent requests

**Solutions**:
1. Limit concurrent sessions
2. Use external Fossil server
3. Increase server resources

---

## Data Recovery

### Corrupted Session

**Symptom**: Session won't load or errors

**Recovery**:
```bash
# Back up first
cp -r ~/.mimo/projects/{id}/sessions/{id} ~/.mimo/backup-session-{id}

# Re-initialize worktree
cd ~/.mimo/projects/{id}/sessions/{id}
rm -rf worktree
fossil open ../../repo.fossil --workdir worktree
```

### Lost Chat History

**Recovery**:
```bash
# Check for backup files
ls -la ~/.mimo/projects/{id}/sessions/{id}/chat*.jsonl

# Restore from backup if exists
cp chat.jsonl.backup chat.jsonl
```

### Corrupted Config

**Recovery**:
```bash
# Reset to defaults
rm ~/.mimo/config.yaml
# Platform will recreate with defaults on next start
```

---

## Getting Help

### Gather Information

Before reporting an issue, gather:

```bash
# Platform version
cd packages/mimo-platform
git log --oneline -5

# System info
uname -a
node --version
bun --version
fossil version

# Recent logs
tail -100 ~/.mimo/platform.log 2>/dev/null || echo "No log file"

# Disk space
df -h ~/.mimo

# Memory usage
free -h
```

### Report an Issue

1. Check existing issues: https://github.com/your-org/mimo/issues
2. Create new issue with:
   - Description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - System information (see above)
   - Relevant log excerpts

---

## Debugging Mode

Enable verbose logging:

```bash
# Platform
DEBUG=* bun run dev

# Agent
DEBUG=1 ./mimo-agent --token ... --platform ...

# Both
DEBUG=* MIMO_AGENT_DEBUG=1 bun run dev
```
