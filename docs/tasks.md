# Development Tasks

> Generated from: `2026_02_16_telegram_happy_dashboard_launcher/prd.md`
> Generated on: 2026-02-16

## Overview

### Development Phases
- **POC**: secure launch-only Telegram dashboard for Happy (`project -> tool -> execute -> status`).
- **MVP**: harden policy validation, timeout/error taxonomy, structured logging, Linux/macOS verification.
- **Full Features**: optional Windows pass, lock/queue model, multi-machine routing.

### Key Dependencies
- Strict policy config (`workspaceRoot`, `allowedUsers`, `allowedTools`, `startupTimeoutMs`, `auditLogDir`)
- Fixed command templates only (`happy`, `happy codex`)
- Deterministic Telegram UX with no free-text commands
- Audit logs for every allow/deny/launch result

---

## Dependencies Map

### Visual Dependency Graph

```text
[1.1] -> [1.2] -> [1.3] -> [1.4] -> [2.1] -> [2.3]
                    \-> [2.2] ------/
[2.3] -> [3.1] -> [3.2]
[4.1] optional after 3.2
```

### Dependency Table

| Task ID | Task Title | Depends On | Blocks | Can Parallel With |
|---|---|---|---|---|
| 1.1 | Define policy config schema + startup validation | None | 1.2, 1.3, 1.4 | None |
| 1.2 | Implement workspace project discovery with root boundary checks | 1.1 | 1.3, 2.2 | 1.4 |
| 1.3 | Implement deterministic Telegram selection UX | 1.1, 1.2 | 2.1, 2.3 | 1.4 |
| 1.4 | Implement template-only launcher + timeout/reason taxonomy | 1.1 | 2.1, 2.3 | 1.2, 1.3 |
| 2.1 | Implement structured audit logging in dedicated folder | 1.3, 1.4 | 2.3, 3.1 | 2.2 |
| 2.2 | Implement command execution acknowledger (launch-and-forget) | 1.2, 1.4 | 2.3 | 2.1 |
| 2.3 | Linux + macOS integration test matrix and docs | 2.1, 2.2 | 3.1 | None |
| 3.1 | End-to-end POC validation and release checklist | 2.3 | 3.2 | None |
| 3.2 | MVP signoff package (security + reliability gates) | 3.1 | 4.1+ | None |
| 4.1 | Optional Windows compatibility pass | 3.2 | None | None |
| 4.2 | Optional active launch lock / queue policy | 3.2 | None | 4.1 |
| 4.3 | Optional multi-machine routing | 3.2 | None | 4.1, 4.2 |

### Parallel Execution Groups

**Wave 1**
- [ ] Task 1.1: Define policy config schema + startup validation

**Wave 2**
- [ ] Task 1.2: Workspace project discovery + boundary checks
- [ ] Task 1.4: Template-only launcher + timeout/reason taxonomy

**Wave 3**
- [ ] Task 1.3: Deterministic Telegram selection UX
- [ ] Task 2.2: Command execution acknowledger

**Wave 4**
- [ ] Task 2.1: Structured audit logging

**Wave 5**
- [ ] Task 2.3: Linux + macOS integration matrix

**Wave 6**
- [ ] Task 3.1: End-to-end POC validation

**Wave 7**
- [ ] Task 3.2: MVP signoff package

### Critical Path

```text
1.1 -> 1.2 -> 1.3 -> 2.1 -> 2.3 -> 3.1 -> 3.2
```

**Critical Path Length**: 7 gated tasks

---

## Sprint 1: Core Security + Launch Engine (POC)

### Task 1.1: Define policy config schema + startup validation

**Description**: Create and validate configuration schema for allowlists, workspace root, timeout, and log directory.

**Acceptance Criteria**:
- [ ] Config fields include: `workspaceRoot`, `allowedTelegramUsers`, `allowedTools`, `startupTimeoutMs`, `auditLogDir`
- [ ] Service fails fast with clear startup errors on invalid/missing config
- [ ] Default tool policy supports `claude` and optional `codex`

**Dependencies**: None

**PRD Reference**: 6.3, 5.1, 5.5

---

### Task 1.2: Implement workspace project discovery with root boundary checks

**Description**: Build project listing that only exposes subfolders under canonicalized `workspaceRoot`.

**Acceptance Criteria**:
- [ ] `/projects` list only includes directories inside `workspaceRoot`
- [ ] Path canonicalization prevents traversal escapes
- [ ] Out-of-bound or missing project selections return `PATH_DENIED`/`PROJECT_NOT_FOUND`

**Dependencies**: Task 1.1

**PRD Reference**: 3.2 (F2), 4.3, 5.1

---

### Task 1.3: Implement deterministic Telegram selection UX

**Description**: Implement strict interaction flow: select project -> select tool -> execute -> status.

**Acceptance Criteria**:
- [ ] No free-text command execution path is exposed
- [ ] User cannot skip required selection steps
- [ ] Tool options shown are constrained by policy allowlist

**Dependencies**: Task 1.1, 1.2

**PRD Reference**: 3.2 (F5), 4.1

---

### Task 1.4: Implement template-only launcher + timeout/reason taxonomy

**Description**: Execute fixed launch templates with standardized startup timeout and explicit reason codes.

**Acceptance Criteria**:
- [ ] `claude -> happy`, `codex -> happy codex` mapping is hardcoded/templated only
- [ ] Launch result returns `success` or categorized fail reason (`TOOL_NOT_FOUND`, `STARTUP_TIMEOUT`, etc.)
- [ ] `startupTimeoutMs` enforced in execution pipeline

**Dependencies**: Task 1.1

**PRD Reference**: 3.2 (F4, F6), 6.5

---

## Sprint 2: Auditability + Platform Verification (MVP Foundation)

### Task 2.1: Implement structured audit logging in dedicated folder

**Description**: Add JSONL audit logging for all deny/allow/launch outcomes.

**Acceptance Criteria**:
- [ ] Every launch attempt writes a structured log event
- [ ] Log fields include actor, project, tool, result, reason, duration
- [ ] `auditLogDir` is configurable and created if missing

**Dependencies**: Task 1.3, 1.4

**PRD Reference**: 3.2 (F7), 7.1

---

### Task 2.2: Implement command execution acknowledger (launch-and-forget)

**Description**: Confirm command start outcome without maintaining long-running session state.

**Acceptance Criteria**:
- [ ] Bot reports launch started/failed quickly with reason
- [ ] No active session lock/queue tracking included
- [ ] Happy post-launch lifecycle remains out-of-scope and untouched

**Dependencies**: Task 1.2, 1.4

**PRD Reference**: 1.2, 10.1 (Non-goals)

---

### Task 2.3: Linux + macOS integration matrix and docs

**Description**: Validate and document launch behavior on required host platforms.

**Acceptance Criteria**:
- [ ] Linux verification results recorded
- [ ] macOS verification results recorded
- [ ] Platform-specific caveats documented (PATH/env/spawn behavior)

**Dependencies**: Task 2.1, 2.2

**PRD Reference**: 5.4, 8.1

---

## Sprint 3: Release Gate (MVP Completion)

### Task 3.1: End-to-end POC validation and release checklist

**Description**: Validate full user journey and policy/security gates before MVP signoff.

**Acceptance Criteria**:
- [ ] Authorized user can complete project->tool->launch flow end-to-end
- [ ] Unauthorized user is denied and logged
- [ ] Failure scenarios produce correct reason taxonomy and logs

**Dependencies**: Task 2.3

**PRD Reference**: Sections 4, 5, 8.1

---

### Task 3.2: MVP signoff package (security + reliability gates)

**Description**: Produce formal readiness report covering reliability, security, and operability requirements.

**Acceptance Criteria**:
- [ ] Success metrics baseline captured from audit logs
- [ ] Security checklist confirms no arbitrary command path
- [ ] Final go/no-go signoff documented

**Dependencies**: Task 3.1

**PRD Reference**: 1.5, 8, 9

---

## Backlog (Post-MVP)

### Task 4.1: Optional Windows compatibility pass

**Description**: Add and verify Windows launcher compatibility if complexity remains acceptable.

**Acceptance Criteria**:
- [ ] Windows spawn/escaping behavior documented and tested
- [ ] Command templates work under supported Windows shell strategy
- [ ] Known limitations captured in docs

**Dependencies**: Task 3.2

**PRD Reference**: 5.4, 8.2

---

### Task 4.2: Optional active launch lock/queue policy

**Description**: Add one-active-launch or queueing behavior to avoid overlapping trigger races.

**Acceptance Criteria**:
- [ ] Policy supports lock/queue mode configuration
- [ ] Deny/queue behavior is surfaced to user and logs

**Dependencies**: Task 3.2

**PRD Reference**: 8.3

---

### Task 4.3: Optional multi-machine routing

**Description**: Route launch requests by machine alias/target profile.

**Acceptance Criteria**:
- [ ] Machine routing config defined
- [ ] Launch requests resolved to target host policy safely

**Dependencies**: Task 3.2

**PRD Reference**: 8.3

---

## Ambiguous Requirements

| Requirement | Clarification Needed |
|---|---|
| Startup success signal | Is process spawn enough, or should we wait for specific Happy readiness output? |
| Project filtering | Should hidden/system folders be excluded from `/projects` by default? |
| Windows scope | Include full support in MVP or keep as explicit post-MVP milestone only? |
| Log retention | Rotation and retention policy for long-running bot deployments |
