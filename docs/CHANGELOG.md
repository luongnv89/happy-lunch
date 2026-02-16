# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-16

### Added

- Telegram bot with commands: `/start`, `/launch`, `/projects`, `/status`, `/cancel`
- Deterministic UX flow: select project → select tool → launch
- Secure project discovery under configurable workspace root
- Path boundary enforcement with `fs.realpathSync()` and `path.relative()`
- Template-only execution: `claude` → `happy`, `codex` → `happy codex`
- User allowlist authorization on all commands
- Tool allowlist validation
- Detached process spawning with startup check window
- JSONL audit logging with daily rotation
- Zod-based config validation with fail-fast startup
- Graceful shutdown on SIGINT/SIGTERM
- Unit tests for config, workspace, launcher, and audit modules (33 tests)
- macOS and Linux platform verification
