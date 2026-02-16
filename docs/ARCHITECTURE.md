# Architecture

## Overview

happy-lunch is a Telegram bot built with Node.js and TypeScript. It acts as a secure launch gateway — users interact via Telegram commands, and the bot spawns detached Happy CLI processes on the host machine.

```
Telegram User
    │
    ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   bot.ts    │────▶│ workspace.ts │────▶│ launcher.ts │
│ (commands)  │     │ (discovery)  │     │ (spawn)     │
└─────────────┘     └──────────────┘     └─────────────┘
    │                                          │
    ▼                                          ▼
┌─────────────┐                        Detached process
│  audit.ts   │                        (happy / happy codex)
│  (logging)  │
└─────────────┘
```

## Module Responsibilities

### `index.ts` — Entry Point

- Loads environment variables from `.env`
- Validates `TELEGRAM_BOT_TOKEN` exists
- Loads and validates configuration via `config.ts`
- Creates the bot and starts polling
- Registers SIGINT/SIGTERM handlers for graceful shutdown

### `config.ts` — Configuration

- Reads `config.json` from disk
- Validates against `ConfigSchema` (Zod)
- Resolves `workspaceRoot` to an absolute path and verifies it exists
- Creates `auditLogDir` if missing and verifies write access
- Fails fast with descriptive errors on any validation issue

### `types.ts` — Shared Types

- `ConfigSchema` — Zod schema for runtime config validation
- `TOOL_TEMPLATES` — Maps tool names to command arrays (`claude` → `["happy"]`, `codex` → `["happy", "codex"]`)
- `ReasonCode` — Error taxonomy (7 codes covering auth, path, tool, spawn, and timeout failures)
- `AuditEntry` — JSONL log entry shape
- `ConversationState` — Per-chat state machine (`idle` → `select_project` → `select_tool`)

### `bot.ts` — Telegram Handlers

- Registers commands: `/start`, `/launch`, `/projects`, `/status`, `/cancel`
- Manages per-chat conversation state via an in-memory `Map`
- Handles inline keyboard callbacks with index-based `callback_data`
- Enforces user authorization on every interaction
- Orchestrates the full flow: project selection → tool selection → launch → audit

### `workspace.ts` — Project Discovery

- `listProjects()` — Lists immediate subdirectories of `workspaceRoot`, excluding hidden folders
- `resolveProject()` — Canonicalizes the path with `fs.realpathSync()`, validates workspace boundary with `path.relative()`, and checks the safe name regex

### `launcher.ts` — Process Spawning

- `launchTool()` — Spawns a detached child process with the tool's command template
- Validates tool against the allowlist
- Monitors for immediate errors or exits within a check window (2s or `startupTimeoutMs`, whichever is smaller)
- After the check window, unrefs the child and reports success

### `audit.ts` — Audit Logging

- `writeAuditLog()` — Appends a JSON line to `audit-YYYY-MM-DD.jsonl`
- `createAuditEntry()` — Factory function for partial entries
- Write failures are logged to stderr but do not crash the bot

## Data Flow

### Launch Flow

1. User sends `/launch` → bot lists projects as inline keyboard
2. User taps a project → bot resolves path, validates boundary, shows tool keyboard
3. User taps a tool → bot spawns detached process, waits for check window
4. Bot reports success/failure and writes audit entry
5. Conversation state resets to `idle`

### Security Checks (in order)

1. User ID checked against `allowedTelegramUsers`
2. Project name validated against safe regex
3. Path canonicalized and checked against workspace boundary
4. Tool checked against `allowedTools`
5. Tool template resolved (no arbitrary commands)
6. Spawn result monitored for immediate failure

## State Management

Conversation state is stored in-memory per chat ID. The state machine:

```
idle ──[/launch]──▶ select_project ──[tap project]──▶ select_tool ──[tap tool]──▶ idle
  ▲                       │                                │
  └───────[/cancel]───────┴────────────[/cancel]───────────┘
```

There is no persistent state between bot restarts. Audit logs are the only persisted data.
