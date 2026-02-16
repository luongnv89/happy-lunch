# Development Guide

## Prerequisites

- Node.js >= 18
- npm
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- Your numeric Telegram user ID

## Setup

```bash
# Clone and install
git clone https://github.com/luongnv89/happy-lunch.git
cd happy-lunch
npm install

# Create config files
cp .env.example .env
cp config.json.example config.json
```

Edit `.env`:
```
TELEGRAM_BOT_TOKEN=your-token-here
```

Edit `config.json` with your workspace path and Telegram user ID.

## Running

```bash
# Development with hot reload
npm run dev

# Build and run production
npm run build
npm start
```

## Testing

```bash
# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch
```

### Test Structure

Tests live in `tests/` and use [Vitest](https://vitest.dev):

| File | Covers |
|------|--------|
| `config.test.ts` | Config loading, Zod validation, directory checks |
| `workspace.test.ts` | Project listing, path traversal prevention, symlink escapes |
| `launcher.test.ts` | Tool validation, spawn success/failure, binary detection |
| `audit.test.ts` | JSONL format, field completeness, error resilience |

### Writing Tests

- Place test files in `tests/` with the pattern `*.test.ts`
- Tests use temp directories for filesystem operations
- Mock `child_process.spawn` for launcher tests
- Use `vi.mock()` for module-level mocks

## TypeScript

- Target: ES2022
- Module: Node16
- Strict mode enabled
- Output: `dist/`

Build with:
```bash
npm run build
```

## Debugging

### Common Issues

**"TELEGRAM_BOT_TOKEN is not set"**
- Ensure `.env` exists with a valid token

**"Config file not found"**
- Ensure `config.json` exists in the project root, or set `CONFIG_PATH` environment variable

**"workspaceRoot does not exist"**
- The path in `config.json` must exist and be a directory

**"auditLogDir is not writable"**
- Ensure the bot has write permissions to the log directory

### Audit Log Inspection

Logs are in `logs/audit-YYYY-MM-DD.jsonl`. Each line is a JSON object:

```bash
# View today's log
cat logs/audit-$(date +%Y-%m-%d).jsonl | jq .

# Filter failures
cat logs/audit-*.jsonl | jq 'select(.result == "failure")'
```

## Project Conventions

- Use typed error returns (`{ error: ReasonCode }`) instead of throwing
- Validate external data with Zod schemas
- Keep the template-only execution model — never add arbitrary command support
- All user-facing messages go through `bot.ts`
- Audit every significant action (success, failure, denied)
