# Platform Integration Matrix

> Task 2.3: Linux + macOS integration test matrix and docs

## Test Matrix

| Test Area | macOS | Linux | Notes |
|---|---|---|---|
| Config loading + Zod validation | Pass | Pass | |
| workspaceRoot resolution (realpath) | Pass | Pass | macOS: `/var` -> `/private/var` symlink handled |
| Project listing (hidden folder exclusion) | Pass | Pass | |
| Path traversal prevention (../.. in name) | Pass | Pass | |
| Safe project name regex validation | Pass | Pass | |
| Symlink escape detection (path.relative) | Pass | Pass | |
| Process spawn (detached, stdio:ignore) | Pass | Pass | |
| Binary-not-found detection (ENOENT) | Pass | Pass | |
| Immediate exit detection | Pass | Pass | |
| Startup timeout (spawn check window) | Pass | Pass | |
| JSONL audit log writing | Pass | Pass | |
| Audit log dir auto-creation | Pass | Pass | |
| Audit log dir writability check | Pass | Pass | |

## Platform-Specific Caveats

### macOS

- **Temp directory symlink**: `/var` is a symlink to `/private/var` on macOS. All path comparisons use `fs.realpathSync()` to canonicalize, which resolves this automatically.
- **Process spawning**: `child_process.spawn()` with `detached: true` works identically to Linux. No `setsid` wrapper needed — Node handles this.
- **PATH resolution**: `spawn()` without `shell: true` uses `execvp()` semantics, resolving the binary via `$PATH`. Works the same as Linux.

### Linux

- **No known caveats** for the current feature set.
- Process spawning with `detached: true` creates a new process group via `setsid`, allowing the child to outlive the parent.
- `fs.realpathSync()` resolves symlinks correctly on all tested Linux filesystems (ext4, btrfs).

### Windows (Not Supported in POC)

If Windows support is added later, the following caveats apply:

- `detached: true` on Windows creates a new console window unless `stdio: 'ignore'` is also set (already configured).
- `child.unref()` behavior differs — the parent may not exit cleanly without explicit handling.
- Path separators (`\` vs `/`) require normalization. `path.join()` and `path.resolve()` handle this, but any hardcoded paths would break.
- Binary resolution depends on `PATHEXT` environment variable (`.exe`, `.cmd`, `.bat`).
- `fs.realpathSync()` on Windows does not resolve all junction/symlink types consistently.

## Running the Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Test Coverage Summary

- **config.test.ts** (11 tests): Schema validation, fail-fast behavior, defaults, directory checks
- **workspace.test.ts** (11 tests): Project listing, traversal prevention, symlink escape, safe name validation
- **launcher.test.ts** (6 tests): Tool validation, spawn success/failure, binary detection, timeout
- **audit.test.ts** (5 tests): JSONL format, field completeness, multi-entry append, error resilience
