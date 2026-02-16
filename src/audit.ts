import * as fs from "node:fs";
import * as path from "node:path";
import type { AuditEntry, Config } from "./types.js";

/**
 * Write a JSONL audit log entry (Task 2.1).
 * Each line is a complete JSON object for easy parsing and streaming.
 * Log file is named by date: audit-YYYY-MM-DD.jsonl
 */
export function writeAuditLog(entry: AuditEntry, config: Config): void {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const logFile = path.join(config.auditLogDir, `audit-${date}.jsonl`);

  const line = JSON.stringify(entry) + "\n";

  try {
    fs.appendFileSync(logFile, line, "utf-8");
  } catch (err) {
    // Log write failure should not crash the bot — warn to stderr
    console.error(
      `[audit] Failed to write log to ${logFile}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Create a partial audit entry with defaults.
 * Caller fills in the specifics.
 */
export function createAuditEntry(
  telegramUserId: number,
  chatId: number
): AuditEntry {
  return {
    ts: new Date().toISOString(),
    telegramUserId,
    chatId,
    selectedProject: null,
    resolvedProjectPath: null,
    selectedTool: null,
    commandTemplate: null,
    result: "denied",
    reasonCode: null,
    durationMs: 0,
  };
}
