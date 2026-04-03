# Deployment Guide

This guide covers deploying MIMO Platform to production environments.

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 20.04+ recommended) or macOS
- **RAM**: 2GB minimum, 4GB recommended
- **Disk**: 10GB minimum for the application
- **Network**: Ports 3000 (HTTP) and 8000-9000 (Fossil servers)

### Required Software

1. **Bun Runtime**
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Fossil SCM**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install fossil
   
   # macOS
   brew install fossil
   
   # Verify version
   fossil version  # Requires 2.27+
   ```

3. **Git** (for Git repository support)
   ```bash
   sudo apt-get install git
   ```

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-org/mimo.git
cd mimo
```

### 2. Install Platform Dependencies

```bash
cd packages/mimo-platform
bun install
```

### 3. Build the Agent

```bash
cd ../mimo-agent
bun install
bun run build
# Creates dist/mimo-agent
```

### 4. Create Environment Configuration

Create `.env` file in `packages/mimo-platform`:

```bash
# Required
JWT_SECRET=your-super-secret-key-change-this-in-production
PORT=3000

# Optional
PLATFORM_URL=ws://localhost:3000
MIMO_AGENT_PATH=/path/to/mimo-agent/dist/mimo-agent
```

**Important**: Generate a secure JWT_SECRET:
```bash
openssl rand -base64 32
```

### 5. Create Data Directory

```bash
mkdir -p ~/.mimo
chmod 700 ~/.mimo
```

## Running the Application

### Development Mode

```bash
cd packages/mimo-platform
bun run dev
```

### Production Mode

```bash
cd packages/mimo-platform
bun run build  # If there's a build step
JWT_SECRET=your-secret bun run src/index.ts
```

## Production Deployment

### Using Systemd (Linux)

Create `/etc/systemd/system/mimo.service`:

```ini
[Unit]
Description=MIMO Platform
After=network.target

[Service]
Type=simple
User=mimo
WorkingDirectory=/opt/mimo/packages/mimo-platform
Environment="JWT_SECRET=your-secret-key"
Environment="PORT=3000"
Environment="NODE_ENV=production"
ExecStart=/home/mimo/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable mimo
sudo systemctl start mimo
sudo systemctl status mimo
```

### Using Docker

Create `Dockerfile`:

```dockerfile
FROM oven/bun:1

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y fossil git

# Copy package files
COPY packages/mimo-platform/package.json ./
RUN bun install

# Copy source
COPY packages/mimo-platform/src ./src

# Copy and set up agent
COPY packages/mimo-agent/dist/mimo-agent /usr/local/bin/mimo-agent
RUN chmod +x /usr/local/bin/mimo-agent

EXPOSE 3000

ENV JWT_SECRET=${JWT_SECRET}
ENV PORT=3000
ENV MIMO_AGENT_PATH=/usr/local/bin/mimo-agent

CMD ["bun", "run", "src/index.ts"]
```

Build and run:

```bash
docker build -t mimo-platform .
docker run -d \
  -e JWT_SECRET=your-secret \
  -p 3000:3000 \
  -v ~/.mimo:/root/.mimo \
  mimo-platform
```

### Using Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mimo:
    build: .
    ports:
      - "3000:3000"
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - PORT=3000
      - NODE_ENV=production
    volumes:
      - mimo-data:/root/.mimo
    restart: unless-stopped

volumes:
  mimo-data:
```

Run:

```bash
# Create .env file with JWT_SECRET
echo "JWT_SECRET=$(openssl rand -base64 32)" > .env

docker-compose up -d
```

### Using Nginx as Reverse Proxy

Install Nginx:

```bash
sudo apt-get install nginx
```

Create `/etc/nginx/sites-available/mimo`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/mimo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL with Let's Encrypt

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Monitoring

### Health Check Endpoint

```bash
curl http://localhost:3000/health
# Expected: {"status":"healthy"}
```

### Log Monitoring

For systemd:

```bash
sudo journalctl -u mimo -f
```

### Process Monitoring

Check if processes are running:

```bash
# Platform server
ps aux | grep "bun run"

# Fossil servers
ps aux | grep fossil

# Agent processes (when active)
ps aux | grep mimo-agent
```

## Backup

### Automated Backup Script

Create `/opt/mimo/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/mimo"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
mkdir -p $BACKUP_DIR
tar czf $BACKUP_DIR/mimo_$DATE.tar.gz ~/.mimo

# Keep only last 7 days
find $BACKUP_DIR -name "mimo_*.tar.gz" -mtime +7 -delete
```

Schedule with cron:

```bash
# Daily at 2 AM
0 2 * * * /opt/mimo/backup.sh
```

## Troubleshooting

### Common Issues

**Port already in use**:
```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill it
sudo kill -9 <PID>

# Or change port in .env
PORT=3001
```

**Permission denied on ~/.mimo**:
```bash
sudo chown -R $USER:$USER ~/.mimo
chmod 700 ~/.mimo
```

**Agent not starting**:
- Check MIMO_AGENT_PATH is correct
- Ensure mimo-agent binary is executable
- Check agent logs in `~/.mimo/agents/{id}/`

**WebSocket connection fails**:
- Check firewall allows WebSocket connections
- Verify JWT_SECRET is set
- Check browser console for errors

### Getting Help

- Check logs: `sudo journalctl -u mimo`
- Enable debug mode: Set `DEBUG=*` environment variable
- File issues: https://github.com/your-org/mimo/issues
