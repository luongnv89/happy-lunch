# Idea: Telegram Happy Dashboard Launcher (Independent Module)

## Original Concept
Build a standalone Telegram bot module that acts as a dashboard to launch Happy in selected local projects.

Key constraints:
- Keep Happy as an independent module (do not modify Happy codebase)
- Bot runs locally with strict security configuration
- No custom command execution, only select-and-launch flows

## Clarified Understanding
This is a secure local orchestration layer in front of Happy.

Instead of exposing a shell, the Telegram bot only allows an authorized user to:
1. List projects from a configured workspace root
2. Select a project
3. Select an allowed coding tool (default Claude Code, optional Codex)
4. Execute a fixed launch template and confirm launch success

After launch, session handling is delegated to Happy application.

## Target Audience
- Primary: solo developers and small teams using Happy and wanting mobile remote kickoff
- Secondary: power users who need secure launch-only ChatOps flows without full remote shell access

## Goals & Objectives
- Launch Happy sessions from Telegram safely in under 10 seconds
- Keep command surface minimal and deterministic (select -> execute only)
- Prevent drift/conflicts with future Happy updates by avoiding upstream changes
- Enforce local policy: allowed users + allowed tools + constrained workspace path

## Technical Context
- Stack: Telegram bot + local launcher service (Node.js/TS or Python)
- Happy integration: via CLI invocation only (`happy` / `happy codex`), no fork/patch
- Platform support target: Linux + macOS required, Windows optional if implementation complexity stays low
- Timeline: POC 2-4 days
- Budget: side-project / internal tooling
- Constraints:
  - User allowlist must be enforced
  - Workspace root boundary must be enforced
  - Tool allowlist must be enforced
  - No arbitrary shell input accepted
  - Must return clear launch status to Telegram
  - Must enforce standardized startup timeout and explicit failure reasons
  - Must write structured audit logs to a dedicated local folder

## Discussion Notes
- Core POC behavior is intentionally narrow:
  - list projects in workspace
  - choose project
  - choose tool
  - execute fixed launch command
- Finalized strengthening decisions:
  - ✅ Lock command templates (`happy`, `happy codex`)
  - ✅ Only show folders under `workspaceRoot`
  - ✅ Deterministic Telegram UX (project -> tool -> execute -> status)
  - ✅ Startup timeout with clear fail reasons
  - ✅ Structured audit logs in a dedicated local folder (e.g., `./logs/`)
  - ⏭️ Skip active per-user/per-project launch lock for POC (launch-and-forget mode)
- Security settings are local-first configuration:
  - `workspaceRoot`
  - `allowedTools` (default: `claude`, optional: `codex`)
  - `allowedTelegramUsers`
  - `startupTimeoutMs`
  - `auditLogDir`
- Launch success for POC means:
  - command starts successfully in target project context
  - bot confirms status in Telegram
  - further interaction happens in Happy app, not in Telegram bot
