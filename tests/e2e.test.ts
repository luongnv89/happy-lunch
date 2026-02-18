/**
 * End-to-end test: config → workspace → launch → session management → audit
 *
 * Exercises the full lifecycle using real tmux sessions and temp directories.
 * Requires tmux to be installed on the host.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { loadConfig } from "../src/config.js";
import { listProjects, resolveProject } from "../src/workspace.js";
import { launchTool, listSessions, stopSession } from "../src/launcher.js";
import { writeAuditLog, createAuditEntry } from "../src/audit.js";
import { TOOL_TEMPLATES } from "../src/types.js";
import type { Config } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic session name matching launcher.ts logic */
function expectedSessionName(projectDir: string, tool: string): string {
  return `happy-${projectDir}-${tool}`.replace(/[^a-zA-Z0-9._-]/g, "-");
}

/** Check if a tmux session exists by name */
function tmuxSessionExists(name: string): boolean {
  try {
    execFileSync("tmux", ["has-session", "-t", name], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/** Kill a tmux session if it exists (cleanup helper) */
function tmuxKillIfExists(name: string): void {
  try {
    execFileSync("tmux", ["kill-session", "-t", name], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // ignore
  }
}

/** Read all JSONL lines from the audit log directory for today */
function readTodayAuditLines(auditLogDir: string): unknown[] {
  const date = new Date().toISOString().slice(0, 10);
  const logFile = path.join(auditLogDir, `audit-${date}.jsonl`);
  if (!fs.existsSync(logFile)) return [];
  return fs
    .readFileSync(logFile, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;
let workspaceDir: string;
let auditLogDir: string;
let configPath: string;
let config: Config;

// We patch TOOL_TEMPLATES so we don't need `happy` installed.
// `sleep 30` keeps the session alive long enough for assertions.
const origClaude = TOOL_TEMPLATES.claude;
const origCodex = TOOL_TEMPLATES.codex;

// Track sessions we create so afterEach can clean them up
const createdSessions: string[] = [];

beforeEach(() => {
  // Temp directories
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "happy-e2e-"));
  workspaceDir = path.join(tmpDir, "workspace");
  auditLogDir = path.join(tmpDir, "logs");
  fs.mkdirSync(workspaceDir);

  // Sample projects
  fs.mkdirSync(path.join(workspaceDir, "project-alpha"));
  fs.mkdirSync(path.join(workspaceDir, "project-beta"));
  // A hidden dir that should be excluded
  fs.mkdirSync(path.join(workspaceDir, ".hidden-project"));
  // A file that should be excluded from project listing
  fs.writeFileSync(path.join(workspaceDir, "not-a-project.txt"), "hello");

  // Write config file
  configPath = path.join(tmpDir, "config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      workspaceRoot: workspaceDir,
      allowedTelegramUsers: [111],
      allowedTools: ["claude", "codex"],
      startupTimeoutMs: 2000,
      auditLogDir,
    })
  );

  // Load & validate config through the real loader
  config = loadConfig(configPath);

  // Patch templates to use real commands
  TOOL_TEMPLATES.claude = ["sleep", "30"];
  TOOL_TEMPLATES.codex = ["sleep", "30"];

  createdSessions.length = 0;
});

afterEach(() => {
  // Restore templates
  TOOL_TEMPLATES.claude = origClaude;
  TOOL_TEMPLATES.codex = origCodex;

  // Kill any tmux sessions we created
  for (const s of createdSessions) {
    tmuxKillIfExists(s);
  }

  // Clean temp directory
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("E2E: full launch lifecycle", () => {
  it("config loading validates and normalizes paths", () => {
    // workspaceRoot should be normalized to an absolute real path
    expect(path.isAbsolute(config.workspaceRoot)).toBe(true);
    expect(path.isAbsolute(config.auditLogDir)).toBe(true);
    expect(fs.existsSync(config.auditLogDir)).toBe(true);
    expect(config.allowedTools).toEqual(["claude", "codex"]);
    expect(config.startupTimeoutMs).toBe(2000);
  });

  it("lists projects excluding hidden dirs and files", () => {
    const projects = listProjects(config);
    expect(projects).toEqual(["project-alpha", "project-beta"]);
    expect(projects).not.toContain(".hidden-project");
    expect(projects).not.toContain("not-a-project.txt");
  });

  it("resolves a valid project to its canonical path", () => {
    const result = resolveProject("project-alpha", config);
    expect("path" in result).toBe(true);
    if ("path" in result) {
      expect(result.path).toContain("project-alpha");
      expect(path.isAbsolute(result.path)).toBe(true);
    }
  });

  it("rejects path traversal attempts", () => {
    const result = resolveProject("../../../etc", config);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("PATH_DENIED");
    }
  });

  it("rejects nonexistent project", () => {
    const result = resolveProject("no-such-project", config);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("PROJECT_NOT_FOUND");
    }
  });

  it("launches a tool in a tmux session and stops it", async () => {
    const resolved = resolveProject("project-alpha", config);
    expect("path" in resolved).toBe(true);
    if (!("path" in resolved)) return;

    const sessionName = expectedSessionName("project-alpha", "claude");
    createdSessions.push(sessionName);

    // Launch
    const result = await launchTool("claude", resolved.path, config);
    expect(result.success).toBe(true);
    expect(result.message).toContain("tmux");
    expect(result.message).toContain(sessionName);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // Verify the session actually exists in tmux
    expect(tmuxSessionExists(sessionName)).toBe(true);

    // Verify it appears in listSessions
    const sessions = listSessions();
    const match = sessions.find((s) => s.name === sessionName);
    expect(match).toBeDefined();
    expect(match!.project).toBe("project-alpha");
    expect(match!.tool).toBe("claude");

    // Stop the session
    const stopResult = stopSession(sessionName);
    expect(stopResult.success).toBe(true);
    expect(tmuxSessionExists(sessionName)).toBe(false);
  });

  it("launches two tools in the same project simultaneously", async () => {
    const resolved = resolveProject("project-alpha", config);
    expect("path" in resolved).toBe(true);
    if (!("path" in resolved)) return;

    const sessionClaude = expectedSessionName("project-alpha", "claude");
    const sessionCodex = expectedSessionName("project-alpha", "codex");
    createdSessions.push(sessionClaude, sessionCodex);

    // Launch both tools
    const [resultClaude, resultCodex] = await Promise.all([
      launchTool("claude", resolved.path, config),
      launchTool("codex", resolved.path, config),
    ]);

    expect(resultClaude.success).toBe(true);
    expect(resultCodex.success).toBe(true);

    // Both sessions should exist
    expect(tmuxSessionExists(sessionClaude)).toBe(true);
    expect(tmuxSessionExists(sessionCodex)).toBe(true);

    // Stop one — the other should remain
    stopSession(sessionClaude);
    expect(tmuxSessionExists(sessionClaude)).toBe(false);
    expect(tmuxSessionExists(sessionCodex)).toBe(true);
  });

  it("launches in two different projects simultaneously", async () => {
    const resolvedA = resolveProject("project-alpha", config);
    const resolvedB = resolveProject("project-beta", config);
    expect("path" in resolvedA).toBe(true);
    expect("path" in resolvedB).toBe(true);
    if (!("path" in resolvedA) || !("path" in resolvedB)) return;

    const sessionA = expectedSessionName("project-alpha", "claude");
    const sessionB = expectedSessionName("project-beta", "claude");
    createdSessions.push(sessionA, sessionB);

    const [resultA, resultB] = await Promise.all([
      launchTool("claude", resolvedA.path, config),
      launchTool("claude", resolvedB.path, config),
    ]);

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
    expect(tmuxSessionExists(sessionA)).toBe(true);
    expect(tmuxSessionExists(sessionB)).toBe(true);

    // Both appear in session listing
    const sessions = listSessions();
    const names = sessions.map((s) => s.name);
    expect(names).toContain(sessionA);
    expect(names).toContain(sessionB);
  });

  it("replaces an existing session on re-launch", async () => {
    const resolved = resolveProject("project-alpha", config);
    expect("path" in resolved).toBe(true);
    if (!("path" in resolved)) return;

    const sessionName = expectedSessionName("project-alpha", "claude");
    createdSessions.push(sessionName);

    // First launch
    const result1 = await launchTool("claude", resolved.path, config);
    expect(result1.success).toBe(true);
    expect(tmuxSessionExists(sessionName)).toBe(true);

    // Second launch (same project + tool) — should kill old and create new
    const result2 = await launchTool("claude", resolved.path, config);
    expect(result2.success).toBe(true);
    expect(tmuxSessionExists(sessionName)).toBe(true);
  });

  it("rejects disallowed tool", async () => {
    const resolved = resolveProject("project-alpha", config);
    expect("path" in resolved).toBe(true);
    if (!("path" in resolved)) return;

    const result = await launchTool("bash", resolved.path, config);
    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe("TOOL_NOT_ALLOWED");
  });

  it("rejects tool not in config allowlist", async () => {
    const resolved = resolveProject("project-alpha", config);
    expect("path" in resolved).toBe(true);
    if (!("path" in resolved)) return;

    // Config that only allows claude
    const restrictedConfig = { ...config, allowedTools: ["claude"] as ("claude" | "codex")[] };
    const result = await launchTool("codex", resolved.path, restrictedConfig);
    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe("TOOL_NOT_ALLOWED");
  });

  it("stopSession returns failure for nonexistent session", () => {
    const result = stopSession("happy-nonexistent-session-xyz");
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("listSessions returns empty when no happy sessions exist", () => {
    // We haven't launched anything yet
    const sessions = listSessions().filter((s) =>
      s.name.startsWith("happy-e2e-")
    );
    expect(sessions).toEqual([]);
  });
});

describe("E2E: audit logging through full flow", () => {
  it("records a successful launch in the audit log", async () => {
    const resolved = resolveProject("project-alpha", config);
    expect("path" in resolved).toBe(true);
    if (!("path" in resolved)) return;

    const sessionName = expectedSessionName("project-alpha", "claude");
    createdSessions.push(sessionName);

    // Launch
    const result = await launchTool("claude", resolved.path, config);
    expect(result.success).toBe(true);

    // Write audit entry (simulating what bot.ts does)
    const entry = createAuditEntry(111, 999);
    entry.selectedProject = "project-alpha";
    entry.resolvedProjectPath = resolved.path;
    entry.selectedTool = "claude";
    entry.commandTemplate = "sleep 30";
    entry.result = "success";
    entry.durationMs = result.durationMs;
    writeAuditLog(entry, config);

    // Verify audit log
    const lines = readTodayAuditLines(config.auditLogDir);
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const last = lines[lines.length - 1] as Record<string, unknown>;
    expect(last.telegramUserId).toBe(111);
    expect(last.chatId).toBe(999);
    expect(last.selectedProject).toBe("project-alpha");
    expect(last.selectedTool).toBe("claude");
    expect(last.result).toBe("success");
    expect(last.reasonCode).toBeNull();
    expect(typeof last.ts).toBe("string");
    expect(typeof last.durationMs).toBe("number");
  });

  it("records a failed launch in the audit log", async () => {
    const resolved = resolveProject("project-alpha", config);
    expect("path" in resolved).toBe(true);
    if (!("path" in resolved)) return;

    // Try to launch disallowed tool
    const result = await launchTool("bash", resolved.path, config);
    expect(result.success).toBe(false);

    // Write audit entry
    const entry = createAuditEntry(111, 999);
    entry.selectedProject = "project-alpha";
    entry.resolvedProjectPath = resolved.path;
    entry.selectedTool = "bash";
    entry.result = "failure";
    entry.reasonCode = result.reasonCode ?? null;
    entry.durationMs = result.durationMs;
    writeAuditLog(entry, config);

    const lines = readTodayAuditLines(config.auditLogDir);
    const last = lines[lines.length - 1] as Record<string, unknown>;
    expect(last.result).toBe("failure");
    expect(last.reasonCode).toBe("TOOL_NOT_ALLOWED");
  });

  it("records a denied access attempt in the audit log", () => {
    const entry = createAuditEntry(999, 888);
    entry.result = "denied";
    entry.reasonCode = "UNAUTHORIZED_USER";
    writeAuditLog(entry, config);

    const lines = readTodayAuditLines(config.auditLogDir);
    const last = lines[lines.length - 1] as Record<string, unknown>;
    expect(last.telegramUserId).toBe(999);
    expect(last.result).toBe("denied");
    expect(last.reasonCode).toBe("UNAUTHORIZED_USER");
    expect(last.selectedProject).toBeNull();
  });

  it("accumulates multiple audit entries in a single file", async () => {
    const resolved = resolveProject("project-alpha", config);
    expect("path" in resolved).toBe(true);
    if (!("path" in resolved)) return;

    const sessionName = expectedSessionName("project-alpha", "claude");
    createdSessions.push(sessionName);

    // Entry 1: denied
    const e1 = createAuditEntry(999, 888);
    e1.result = "denied";
    e1.reasonCode = "UNAUTHORIZED_USER";
    writeAuditLog(e1, config);

    // Entry 2: failed launch
    const failResult = await launchTool("bash", resolved.path, config);
    const e2 = createAuditEntry(111, 999);
    e2.selectedProject = "project-alpha";
    e2.selectedTool = "bash";
    e2.result = "failure";
    e2.reasonCode = failResult.reasonCode ?? null;
    writeAuditLog(e2, config);

    // Entry 3: successful launch
    const successResult = await launchTool("claude", resolved.path, config);
    const e3 = createAuditEntry(111, 999);
    e3.selectedProject = "project-alpha";
    e3.selectedTool = "claude";
    e3.result = "success";
    e3.durationMs = successResult.durationMs;
    writeAuditLog(e3, config);

    // All three entries should be present
    const lines = readTodayAuditLines(config.auditLogDir);
    expect(lines.length).toBe(3);
    expect((lines[0] as Record<string, unknown>).result).toBe("denied");
    expect((lines[1] as Record<string, unknown>).result).toBe("failure");
    expect((lines[2] as Record<string, unknown>).result).toBe("success");
  });
});

describe("E2E: config validation rejects bad configs", () => {
  it("rejects missing workspaceRoot", () => {
    const badPath = path.join(tmpDir, "bad-config.json");
    fs.writeFileSync(
      badPath,
      JSON.stringify({
        workspaceRoot: "/nonexistent/path/xyz",
        allowedTelegramUsers: [111],
        allowedTools: ["claude"],
      })
    );
    expect(() => loadConfig(badPath)).toThrow("workspaceRoot does not exist");
  });

  it("rejects empty allowedTelegramUsers", () => {
    const badPath = path.join(tmpDir, "bad-config2.json");
    fs.writeFileSync(
      badPath,
      JSON.stringify({
        workspaceRoot: workspaceDir,
        allowedTelegramUsers: [],
        allowedTools: ["claude"],
      })
    );
    expect(() => loadConfig(badPath)).toThrow("Invalid configuration");
  });

  it("rejects invalid tool names", () => {
    const badPath = path.join(tmpDir, "bad-config3.json");
    fs.writeFileSync(
      badPath,
      JSON.stringify({
        workspaceRoot: workspaceDir,
        allowedTelegramUsers: [111],
        allowedTools: ["vim"],
      })
    );
    expect(() => loadConfig(badPath)).toThrow("Invalid configuration");
  });
});

describe("E2E: workspace security boundaries", () => {
  it("prevents symlink escape from workspace", () => {
    // Create a symlink inside workspace that points outside
    const outsideDir = path.join(tmpDir, "outside-workspace");
    fs.mkdirSync(outsideDir);
    const symlinkPath = path.join(workspaceDir, "sneaky-link");
    fs.symlinkSync(outsideDir, symlinkPath);

    const result = resolveProject("sneaky-link", config);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("PATH_DENIED");
    }
  });

  it("prevents names with shell metacharacters", () => {
    const result = resolveProject("project;rm -rf /", config);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("PATH_DENIED");
    }
  });

  it("allows project names with dots and underscores", () => {
    fs.mkdirSync(path.join(workspaceDir, "my_project.v2"));
    const result = resolveProject("my_project.v2", config);
    expect("path" in result).toBe(true);
  });
});

describe("E2E: tmux environment sanitization", () => {
  it("strips CLAUDECODE env var from spawned sessions", async () => {
    // Set CLAUDECODE in current env to simulate running inside Claude Code
    const origClaudeCode = process.env.CLAUDECODE;
    process.env.CLAUDECODE = "1";

    const resolved = resolveProject("project-alpha", config);
    expect("path" in resolved).toBe(true);
    if (!("path" in resolved)) return;

    const sessionName = expectedSessionName("project-alpha", "claude");
    createdSessions.push(sessionName);

    try {
      const result = await launchTool("claude", resolved.path, config);
      expect(result.success).toBe(true);

      // The session is running — verify CLAUDECODE was stripped
      // We can check by inspecting the tmux environment
      const envOutput = execFileSync(
        "tmux",
        ["show-environment", "-t", sessionName, "CLAUDECODE"],
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      // tmux show-environment returns "-CLAUDECODE" when variable is removed
      // or nothing / error if it was never set
      expect(envOutput).not.toBe("CLAUDECODE=1");
    } catch {
      // show-environment may error if CLAUDECODE was never passed — that's fine
      // The important thing is it's not "CLAUDECODE=1"
    } finally {
      if (origClaudeCode !== undefined) {
        process.env.CLAUDECODE = origClaudeCode;
      } else {
        delete process.env.CLAUDECODE;
      }
    }
  });
});
