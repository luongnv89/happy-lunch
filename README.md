<p align="center">
  <img src="assets/logo/logo-full.svg" alt="happy-lunch logo" width="360" />
</p>

<p align="center">
  <strong>Launch your Happy sessions from anywhere — one tap, zero friction.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue.svg" alt="TypeScript" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D18-green.svg" alt="Node.js" /></a>
</p>

---

A secure Telegram bot that launches [Happy](https://github.com/your-happy-repo) CLI sessions in local projects. Authorized users select a project and tool via Telegram, and the bot spawns a detached Happy process — no upstream modifications required.

## Key Features

- **Security-first** — Strict allowlists for users, tools, and workspace paths
- **Template-only execution** — No arbitrary commands; only predefined templates (`happy`, `happy codex`)
- **Deterministic UX** — Forced workflow: select project → select tool → launch → status
- **Path boundary enforcement** — Canonicalized paths with symlink escape prevention
- **Audit logging** — Structured JSONL logs for every action (success, failure, denied)
- **Graceful shutdown** — Clean process cleanup on SIGINT/SIGTERM

## Quick Start

### Prerequisites

- Node.js >= 18
- A [Telegram Bot Token](https://core.telegram.org/bots#how-do-i-create-a-bot) from @BotFather
- Your Telegram user ID (numeric)

### One-Line Install

Install, configure, and optionally run as a service with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/luongnv89/happy-lunch/main/install.sh | bash -s -- \
  --token "YOUR_BOT_TOKEN" \
  --users "YOUR_TELEGRAM_USER_ID" \
  --workspace "/path/to/your/projects"
```

To also install as a background service (auto-starts on boot):

```bash
curl -fsSL https://raw.githubusercontent.com/luongnv89/happy-lunch/main/install.sh | bash -s -- \
  --token "YOUR_BOT_TOKEN" \
  --users "YOUR_TELEGRAM_USER_ID" \
  --workspace "/path/to/your/projects" \
  --service
```

Or run interactively (prompts for required values):

```bash
curl -fsSL https://raw.githubusercontent.com/luongnv89/happy-lunch/main/install.sh | bash
```

The installer handles Node.js detection/installation, dependency setup, build, configuration, and optional service registration for both Linux (systemd) and macOS (launchd).

### Manual Installation

```bash
git clone https://github.com/luongnv89/happy-lunch.git
cd happy-lunch
npm install
```

### Configuration

1. Create your environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your Telegram bot token:

```
TELEGRAM_BOT_TOKEN=your-bot-token-here
```

2. Create your config file:

```bash
cp config.json.example config.json
```

Edit `config.json`:

```json
{
  "workspaceRoot": "/path/to/your/workspace",
  "allowedTelegramUsers": [123456789],
  "allowedTools": ["claude", "codex"],
  "startupTimeoutMs": 8000,
  "auditLogDir": "./logs"
}
```

| Field | Description |
|-------|-------------|
| `workspaceRoot` | Absolute path to the directory containing your projects |
| `allowedTelegramUsers` | Array of numeric Telegram user IDs authorized to use the bot |
| `allowedTools` | Tools available for launching (`claude` → `happy`, `codex` → `happy codex`) |
| `startupTimeoutMs` | How long to wait for a spawned process before declaring success (default: 8000) |
| `auditLogDir` | Directory for JSONL audit logs (default: `./logs`) |

### Run

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

### Run as a Service

If you installed manually and want to add the service later:

```bash
bash install.sh --service
```

**Linux (systemd):**
```bash
sudo systemctl status happy-lunch     # Check status
sudo systemctl stop happy-lunch       # Stop
sudo systemctl start happy-lunch      # Start
sudo systemctl restart happy-lunch    # Restart
sudo journalctl -u happy-lunch -f     # View logs
```

**macOS (launchd):**
```bash
launchctl list | grep happy-lunch                                    # Check status
launchctl unload ~/Library/LaunchAgents/com.happy-lunch.bot.plist    # Stop
launchctl load -w ~/Library/LaunchAgents/com.happy-lunch.bot.plist   # Start
tail -f ~/.happy-lunch/logs/launchd-stdout.log                       # View logs
```

### Uninstall

**Linux:**
```bash
sudo systemctl stop happy-lunch && sudo systemctl disable happy-lunch
sudo rm /etc/systemd/system/happy-lunch.service && sudo systemctl daemon-reload
rm -rf ~/.happy-lunch
```

**macOS:**
```bash
launchctl unload ~/Library/LaunchAgents/com.happy-lunch.bot.plist
rm ~/Library/LaunchAgents/com.happy-lunch.bot.plist
rm -rf ~/.happy-lunch
```

### Usage

Open your Telegram bot and use these commands:

| Command | Description |
|---------|-------------|
| `/launch` | Start a Happy session (project → tool → execute) |
| `/projects` | List available projects under workspace root |
| `/status` | Show current conversation state |
| `/cancel` | Cancel the current flow |

## Project Structure

```
happy-lunch/
├── src/
│   ├── index.ts        # Entry point — loads env, config, starts bot
│   ├── config.ts       # Config loading & Zod validation
│   ├── types.ts        # Shared types, schemas, error taxonomy
│   ├── bot.ts          # Telegram command handlers & UX flow
│   ├── workspace.ts    # Project discovery & path validation
│   ├── launcher.ts     # Process spawning & timeout handling
│   └── audit.ts        # JSONL audit logging
├── tests/              # Unit tests (Vitest)
├── docs/               # Project documentation
├── config.json.example # Config template
├── .env.example        # Environment template
├── tsconfig.json       # TypeScript configuration
└── package.json
```

## Tech Stack

- **Runtime**: Node.js + TypeScript (ES2022, strict mode)
- **Bot Framework**: [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)
- **Validation**: [Zod](https://zod.dev)
- **Testing**: [Vitest](https://vitest.dev)
- **Environment**: [dotenv](https://github.com/motdotla/dotenv)

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

The test suite covers config validation, workspace path traversal prevention, process launching, and audit logging (33 tests across 4 suites).

## Security Model

The bot enforces multiple layers of protection:

1. **User allowlist** — Only numeric Telegram IDs in `allowedTelegramUsers` can interact
2. **Tool allowlist** — Only tools in `allowedTools` can be launched
3. **Workspace boundary** — `fs.realpathSync()` + `path.relative()` prevents escaping the workspace root
4. **Project name validation** — Regex `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/` rejects malicious names
5. **Index-based callbacks** — Inline keyboard uses indices, not user-controlled strings
6. **Template-only commands** — No arbitrary shell execution; only predefined tool templates
7. **Audit trail** — Every action logged to JSONL with user ID, timestamps, and reason codes

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and how to submit changes.

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
