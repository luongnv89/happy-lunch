import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig } from "../src/config.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "happy-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(dir: string, config: Record<string, unknown>): string {
  const configPath = path.join(dir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config));
  return configPath;
}

function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    workspaceRoot: tmpDir,
    allowedTelegramUsers: [123456],
    allowedTools: ["claude"],
    ...overrides,
  };
}

describe("loadConfig", () => {
  it("loads a valid config successfully", () => {
    const configPath = writeConfig(tmpDir, validConfig());
    const config = loadConfig(configPath);

    // macOS: /var -> /private/var, so config resolves via realpath; compare resolved
    expect(fs.realpathSync(config.workspaceRoot)).toBe(fs.realpathSync(tmpDir));
    expect(config.allowedTelegramUsers).toEqual([123456]);
    expect(config.allowedTools).toEqual(["claude"]);
    expect(config.startupTimeoutMs).toBe(8000); // default
  });

  it("throws on missing config file", () => {
    expect(() => loadConfig("/nonexistent/path.json")).toThrow(
      "Config file not found"
    );
  });

  it("throws on invalid JSON", () => {
    const configPath = path.join(tmpDir, "bad.json");
    fs.writeFileSync(configPath, "not json{{{");
    expect(() => loadConfig(configPath)).toThrow("Failed to parse config file");
  });

  it("throws on missing required fields", () => {
    const configPath = writeConfig(tmpDir, {});
    expect(() => loadConfig(configPath)).toThrow("Invalid configuration");
  });

  it("throws on empty allowedTelegramUsers", () => {
    const configPath = writeConfig(tmpDir, validConfig({ allowedTelegramUsers: [] }));
    expect(() => loadConfig(configPath)).toThrow("Invalid configuration");
  });

  it("throws on invalid tool name", () => {
    const configPath = writeConfig(
      tmpDir,
      validConfig({ allowedTools: ["bash"] })
    );
    expect(() => loadConfig(configPath)).toThrow("Invalid configuration");
  });

  it("throws when workspaceRoot does not exist", () => {
    const configPath = writeConfig(
      tmpDir,
      validConfig({ workspaceRoot: "/nonexistent/dir" })
    );
    expect(() => loadConfig(configPath)).toThrow("workspaceRoot does not exist");
  });

  it("throws when workspaceRoot is a file, not a directory", () => {
    const filePath = path.join(tmpDir, "afile");
    fs.writeFileSync(filePath, "hello");
    const configPath = writeConfig(tmpDir, validConfig({ workspaceRoot: filePath }));
    expect(() => loadConfig(configPath)).toThrow("workspaceRoot is not a directory");
  });

  it("creates auditLogDir if missing", () => {
    const logDir = path.join(tmpDir, "new-logs");
    const configPath = writeConfig(tmpDir, validConfig({ auditLogDir: logDir }));
    const config = loadConfig(configPath);

    expect(fs.existsSync(config.auditLogDir)).toBe(true);
  });

  it("applies default startupTimeoutMs when omitted", () => {
    const configPath = writeConfig(tmpDir, validConfig());
    const config = loadConfig(configPath);
    expect(config.startupTimeoutMs).toBe(8000);
  });

  it("accepts custom startupTimeoutMs", () => {
    const configPath = writeConfig(
      tmpDir,
      validConfig({ startupTimeoutMs: 5000 })
    );
    const config = loadConfig(configPath);
    expect(config.startupTimeoutMs).toBe(5000);
  });
});
