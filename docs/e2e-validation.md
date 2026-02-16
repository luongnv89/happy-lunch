# End-to-End POC Validation

> Task 3.1: End-to-end POC validation and release checklist

## Validation Scenarios

### Scenario 1: Authorized User — Full Launch Flow

**Steps**:
1. Authorized user sends `/launch`
2. Bot displays project list as inline keyboard buttons
3. User taps a project
4. Bot validates project path and displays tool selection
5. User taps a tool (e.g., `claude`)
6. Bot launches the command and reports success/failure

**Expected**:
- [x] Each step transitions deterministically (no free-text input accepted)
- [x] Inline keyboards constrain selection to valid options only
- [x] Launch result includes clear success message or categorized failure reason
- [x] Audit log entry written with all fields: user, project, tool, result, duration

### Scenario 2: Authorized User — Project Listing

**Steps**:
1. Authorized user sends `/projects`
2. Bot lists directories under `workspaceRoot`

**Expected**:
- [x] Only non-hidden directories shown
- [x] No directories outside workspace root leaked

### Scenario 3: Unauthorized User — Denied

**Steps**:
1. User not in `allowedTelegramUsers` sends any command (`/start`, `/launch`, `/projects`)

**Expected**:
- [x] Bot responds with "Access denied" message
- [x] Audit log entry written with `result: "denied"` and `reasonCode: "UNAUTHORIZED_USER"`
- [x] No project or tool information is exposed

### Scenario 4: Path Traversal Attempt

**Steps**:
1. Attacker crafts a callback with `project:../../etc`

**Expected**:
- [x] Project name regex rejects unsafe characters (`PATH_DENIED`)
- [x] Even if bypassed, `realpathSync` + `path.relative()` boundary check prevents escape
- [x] Audit log entry records the failed attempt

### Scenario 5: Symlink Escape Attempt

**Steps**:
1. Symlink inside workspace points to directory outside workspace
2. User selects the symlink project

**Expected**:
- [x] `realpathSync` resolves the symlink to its real target
- [x] `path.relative()` detects target is outside workspace root
- [x] Returns `PATH_DENIED`

### Scenario 6: Missing Tool Binary

**Steps**:
1. User selects a valid project and tool
2. The tool binary (`happy`) is not installed on the host

**Expected**:
- [x] Launcher returns `TOOL_BINARY_NOT_FOUND`
- [x] User receives clear error message in Telegram
- [x] Audit log records the failure

### Scenario 7: Process Exits Immediately

**Steps**:
1. User launches a tool that crashes on startup

**Expected**:
- [x] Launcher returns `SPAWN_ERROR` with exit code
- [x] User notified of failure
- [x] Audit log records the failure

### Scenario 8: Invalid/Missing Configuration

**Steps**:
1. Start bot with missing `config.json`
2. Start bot with invalid fields (empty allowlist, bad path)

**Expected**:
- [x] Service fails fast with clear error message
- [x] Does not start polling Telegram if config is invalid
- [x] Specific validation errors reported (via Zod)

### Scenario 9: Cancel Mid-Flow

**Steps**:
1. User sends `/launch`, sees project list
2. User sends `/cancel` instead of selecting

**Expected**:
- [x] State reset to idle
- [x] User can start a new `/launch` flow cleanly

### Scenario 10: Status Check

**Steps**:
1. User sends `/status` during a flow

**Expected**:
- [x] Current step and selections displayed
- [x] No state mutation from status check

---

## Release Checklist

### Security Gates

- [x] No arbitrary command execution path exists
- [x] All commands are template-only (`happy`, `happy codex`)
- [x] `spawn()` called without `shell: true`
- [x] User allowlist enforced on all commands and callback queries
- [x] Project names validated against safe-character regex
- [x] Path boundary enforced with `realpathSync` + `path.relative()`
- [x] Symlink escape prevented
- [x] Callback data uses index-based approach (no user-controlled strings in callback_data)
- [x] Audit logs written for all allow/deny/launch events

### Reliability Gates

- [x] Config validated at startup with fail-fast behavior
- [x] Audit log directory writability checked at startup
- [x] Process spawn errors handled (ENOENT, immediate exit, timeout)
- [x] Conversation state validated before each step transition
- [x] Graceful shutdown on SIGINT/SIGTERM

### Test Coverage

- [x] 33 tests passing across 4 test files
- [x] Config validation: 11 tests
- [x] Workspace security: 11 tests (including symlink escape)
- [x] Launcher behavior: 6 tests (including spawn success/failure)
- [x] Audit logging: 5 tests (format, append, error resilience)

### Platform Verification

- [x] macOS tested and documented
- [x] Linux behavior documented (spawn semantics identical)
- [x] Windows documented as out of scope with known caveats listed

### Documentation

- [x] `README.md` — project overview
- [x] `docs/platform-matrix.md` — platform test matrix and caveats
- [x] `docs/e2e-validation.md` — this document
- [x] `.env.example` and `config.json.example` — setup templates
