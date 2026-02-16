# happy-lunch

Standalone project for the **Telegram Happy Dashboard Launcher** concept.

## Scope
This repository contains planning documents for a secure Telegram dashboard that launches Happy sessions in selected projects without modifying Happy itself.

## Docs
- `docs/idea.md`
- `docs/validate.md`
- `docs/prd.md`
- `docs/tasks.md`

## Core POC Principles
- Keep Happy independent (no upstream code modifications)
- Deterministic flow: project -> tool -> execute -> status
- Template-only launches (`happy`, `happy codex`)
- Strict allowlists (users/tools/workspaceRoot)
- Structured audit logs in dedicated folder
