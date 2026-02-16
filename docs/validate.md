# Validation: Telegram Happy Dashboard Launcher (Independent Module)

## Quick Verdict
**Build it**

## Why
This is a practical, high-feasibility internal tool with clear daily utility. The narrowed scope (select-only launch flow, no shell passthrough, no Happy code modification) keeps risk manageable while still delivering strong value.

## Similar Products
- Generic ChatOps bots for CI/deploy commands
- SSH-based remote launch scripts
- Telegram shell bots (high risk, usually over-permissioned)

## Differentiation
- Purpose-built for Happy launch workflows
- Non-invasive architecture (no upstream Happy modifications)
- Strict select-and-execute UX instead of free-text command execution

## Strengths
- Minimal surface area and strong security posture for POC
- Upgrade-safe approach by keeping Happy untouched
- Fast path to useful outcome (mobile launch control)

## Concerns
- Process lifecycle handling can be tricky for interactive CLI launchers
- Path traversal and alias validation must be strict
- Telegram identity alone is not enough without allowlist and config hardening
- Windows process spawning/escaping differences can complicate cross-platform parity

## Ratings
- Creativity: 7/10
- Feasibility: 9/10
- Market Impact: 6/10 (high for niche/internal users)
- Technical Execution: 9/10 (with strict guardrails)

## How to Strengthen (Finalized)
1. **Lock command templates (YES)**
   - Claude: `happy`
   - Codex: `happy codex`
   - Never concatenate raw user text into shell commands.

2. **Enforce strict project resolution (YES)**
   - Only show folders under `workspaceRoot`
   - Resolve canonical path and reject anything outside root

3. **Execution safety (partially YES)**
   - ⏭️ Skip one-active-launch lock for now (POC is launch-and-forget)
   - ✅ Standardized startup timeout and clear fail reasons
   - ✅ Structured audit logs (user, project, tool, timestamp, result) in dedicated folder

4. **Keep Telegram UX deterministic (YES)**
   - Step 1: pick project
   - Step 2: pick tool
   - Step 3: execute + status

5. **Cross-platform target (NEW)**
   - Linux + macOS required
   - Windows support included if not overly complex in POC

## Enhanced Version
A secure local Launch Gateway for Happy:
- Telegram bot (dashboard UX)
- Policy engine (`allowedUsers`, `allowedTools`, `workspaceRoot`, `startupTimeoutMs`, `auditLogDir`)
- Launcher runtime executing fixed tool templates
- Status reporter + structured audit log
- Platform profile support for Linux/macOS (and Windows where feasible)
- Optional later additions: queueing, cancel/retry, machine health checks

## Implementation Roadmap
### Phase 1 (POC)
- Config file with:
  - `workspaceRoot`
  - `allowedTelegramUsers`
  - `allowedTools`
  - `startupTimeoutMs`
  - `auditLogDir`
- Commands:
  - `/projects`
  - `/launch` (project selection + tool selection)
- Launch fixed Happy command in selected project
- Return success/failure status to Telegram with explicit fail reason categories
- Write structured audit logs to dedicated folder
- Platform support target: Linux + macOS

### Phase 2 (Hardening)
- Better startup detection/ack logic
- Path canonicalization + policy unit tests
- Structured logs + error taxonomy + retention policy
- Optional Windows compatibility pass

### Phase 3 (Optional)
- Active launch lock / queue policy
- Multi-machine routing
- Role-based access
- Additional fixed workflows (still no arbitrary shell)

## POC Acceptance Criteria
- Authorized user can list projects under configured workspace root only
- Authorized user can choose one allowed tool and trigger launch in selected project
- Bot confirms launch success/failure with standardized timeout and clear failure reasons
- Structured audit log entries are written for every launch attempt in dedicated log folder
- No arbitrary command text is accepted at any stage
- Works on Linux and macOS (Windows optional for POC)
