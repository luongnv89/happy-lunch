# Deployment Guide

## Requirements

- Node.js >= 18
- The `happy` CLI must be installed and available in `PATH` on the host machine
- Network access to Telegram API (`api.telegram.org`)

## Build

```bash
npm ci
npm run build
```

This compiles TypeScript to `dist/`.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `CONFIG_PATH` | No | Custom path to config.json (default: `./config.json`) |

### Config File

Create `config.json` (see `config.json.example`):

```json
{
  "workspaceRoot": "/home/user/projects",
  "allowedTelegramUsers": [123456789],
  "allowedTools": ["claude", "codex"],
  "startupTimeoutMs": 8000,
  "auditLogDir": "/var/log/happy-lunch"
}
```

Ensure:
- `workspaceRoot` exists and contains your project directories
- `auditLogDir` is writable by the bot process
- `allowedTelegramUsers` contains the correct numeric Telegram user IDs

## Running

```bash
node dist/index.js
```

## Running as a Service (systemd)

Create `/etc/systemd/system/happy-lunch.service`:

```ini
[Unit]
Description=Happy Lunch Telegram Bot
After=network.target

[Service]
Type=simple
User=happylunch
WorkingDirectory=/opt/happy-lunch
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/happy-lunch/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable happy-lunch
sudo systemctl start happy-lunch
sudo systemctl status happy-lunch
```

View logs:

```bash
journalctl -u happy-lunch -f
```

## Running with Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ dist/
COPY config.json .
CMD ["node", "dist/index.js"]
```

Build and run:

```bash
docker build -t happy-lunch .
docker run -d \
  --name happy-lunch \
  --env-file .env \
  -v /path/to/workspace:/workspace \
  -v /path/to/logs:/app/logs \
  happy-lunch
```

Note: The workspace must be mounted into the container, and `happy` CLI must be available inside the container.

## Platform Support

| Platform | Status |
|----------|--------|
| macOS | Verified |
| Linux | Verified |
| Windows | Not tested (documented caveats for path handling) |

## Health Checks

- The bot logs `"Happy Launcher bot is running"` on successful startup
- Audit logs in `auditLogDir` confirm the bot is processing requests
- Send `/status` from an authorized Telegram account to verify responsiveness

## Log Rotation

Audit logs are named `audit-YYYY-MM-DD.jsonl` (one file per day). For long-running deployments, consider:

- Setting up `logrotate` for the audit log directory
- Archiving old logs periodically
- Monitoring disk usage in the log directory
