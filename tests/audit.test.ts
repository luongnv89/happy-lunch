import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeAuditLog, createAuditEntry } from "../src/audit.js";
import type { Config } from "../src/types.js";

let tmpDir: string;
let config: Config;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "happy-audit-"));
  config = {
    workspaceRoot: tmpDir,
    allowedTelegramUsers: [1],
    allowedTools: ["claude"],
    startupTimeoutMs: 8000,
    auditLogDir: path.join(tmpDir, "logs"),
  };
  fs.mkdirSync(config.auditLogDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("createAuditEntry", () => {
  it("creates entry with correct defaults", () => {
    const entry = createAuditEntry(123, 456);
    expect(entry.telegramUserId).toBe(123);
    expect(entry.chatId).toBe(456);
    expect(entry.result).toBe("denied");
    expect(entry.selectedProject).toBeNull();
    expect(entry.selectedTool).toBeNull();
    expect(entry.commandTemplate).toBeNull();
    expect(entry.reasonCode).toBeNull();
    expect(entry.durationMs).toBe(0);
    expect(entry.ts).toBeTruthy();
  });
});

describe("writeAuditLog", () => {
  it("writes a JSONL line to date-stamped file", () => {
    const entry = createAuditEntry(100, 200);
    entry.result = "success";
    entry.selectedProject = "my-app";
    writeAuditLog(entry, config);

    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(config.auditLogDir, `audit-${date}.jsonl`);
    expect(fs.existsSync(logFile)).toBe(true);

    const lines = fs
      .readFileSync(logFile, "utf-8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.telegramUserId).toBe(100);
    expect(parsed.chatId).toBe(200);
    expect(parsed.result).toBe("success");
    expect(parsed.selectedProject).toBe("my-app");
  });

  it("appends multiple entries to the same file", () => {
    writeAuditLog(createAuditEntry(1, 1), config);
    writeAuditLog(createAuditEntry(2, 2), config);
    writeAuditLog(createAuditEntry(3, 3), config);

    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(config.auditLogDir, `audit-${date}.jsonl`);
    const lines = fs
      .readFileSync(logFile, "utf-8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(3);
  });

  it("each line is valid JSON with all required fields", () => {
    const entry = createAuditEntry(42, 99);
    entry.result = "failure";
    entry.reasonCode = "PATH_DENIED";
    entry.selectedProject = "test-proj";
    entry.selectedTool = "claude";
    entry.commandTemplate = "happy";
    entry.durationMs = 150;
    writeAuditLog(entry, config);

    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(config.auditLogDir, `audit-${date}.jsonl`);
    const parsed = JSON.parse(fs.readFileSync(logFile, "utf-8").trim());

    expect(parsed).toHaveProperty("ts");
    expect(parsed).toHaveProperty("telegramUserId", 42);
    expect(parsed).toHaveProperty("chatId", 99);
    expect(parsed).toHaveProperty("selectedProject", "test-proj");
    expect(parsed).toHaveProperty("resolvedProjectPath", null);
    expect(parsed).toHaveProperty("selectedTool", "claude");
    expect(parsed).toHaveProperty("commandTemplate", "happy");
    expect(parsed).toHaveProperty("result", "failure");
    expect(parsed).toHaveProperty("reasonCode", "PATH_DENIED");
    expect(parsed).toHaveProperty("durationMs", 150);
  });

  it("does not throw when auditLogDir is invalid", () => {
    const badConfig = { ...config, auditLogDir: "/nonexistent/bad/path" };
    // Should log to stderr but not throw
    expect(() => writeAuditLog(createAuditEntry(1, 1), badConfig)).not.toThrow();
  });
});
