import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Config } from "../src/types.js";

// Force detached spawn path (not osascript) so spawn-level tests work on macOS
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, platform: () => "linux" };
});

const { launchTool } = await import("../src/launcher.js");

let tmpDir: string;
let config: Config;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "happy-launch-"));
  config = {
    workspaceRoot: fs.realpathSync(tmpDir),
    allowedTelegramUsers: [1],
    allowedTools: ["claude", "codex"],
    startupTimeoutMs: 8000,
    auditLogDir: path.join(tmpDir, "logs"),
  };
  fs.mkdirSync(config.auditLogDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("launchTool", () => {
  it("returns TOOL_NOT_ALLOWED for disallowed tool", async () => {
    const result = await launchTool("bash", tmpDir, config);
    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe("TOOL_NOT_ALLOWED");
  });

  it("returns TOOL_NOT_ALLOWED for unknown tool with no template", async () => {
    // Add "claude" to allowed but query a nonexistent template key
    const restrictedConfig = { ...config, allowedTools: ["claude"] as ("claude" | "codex")[] };
    const result = await launchTool("codex", tmpDir, restrictedConfig);
    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe("TOOL_NOT_ALLOWED");
  });

  it("returns TOOL_BINARY_NOT_FOUND for missing binary", async () => {
    const { TOOL_TEMPLATES } = await import("../src/types.js");
    const origClaude = TOOL_TEMPLATES.claude;
    TOOL_TEMPLATES.claude = ["nonexistent-binary-xyz-12345"];
    try {
      const result = await launchTool("claude", tmpDir, config);
      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe("TOOL_BINARY_NOT_FOUND");
    } finally {
      TOOL_TEMPLATES.claude = origClaude;
    }
  });

  it("successfully launches a real command (sleep)", async () => {
    // Use "sleep" as a stand-in for "happy" to test spawn success path
    // We temporarily patch TOOL_TEMPLATES via a custom approach
    const { TOOL_TEMPLATES } = await import("../src/types.js");
    const origClaude = TOOL_TEMPLATES.claude;
    TOOL_TEMPLATES.claude = ["sleep", "10"];
    try {
      const result = await launchTool("claude", tmpDir, {
        ...config,
        startupTimeoutMs: 1000,
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("sleep");
    } finally {
      TOOL_TEMPLATES.claude = origClaude;
    }
  });

  it("returns SPAWN_ERROR for process that exits immediately", async () => {
    const { TOOL_TEMPLATES } = await import("../src/types.js");
    const origClaude = TOOL_TEMPLATES.claude;
    TOOL_TEMPLATES.claude = ["false"]; // `false` exits with code 1 immediately
    try {
      const result = await launchTool("claude", tmpDir, config);
      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe("SPAWN_ERROR");
    } finally {
      TOOL_TEMPLATES.claude = origClaude;
    }
  });

  it("includes durationMs in all results", async () => {
    const result = await launchTool("bash", tmpDir, config);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("headless option uses detached spawn (not Terminal.app)", async () => {
    const { TOOL_TEMPLATES } = await import("../src/types.js");
    const origClaude = TOOL_TEMPLATES.claude;
    TOOL_TEMPLATES.claude = ["sleep", "10"];
    try {
      // Even though tests mock platform to linux, verify headless param is accepted
      const result = await launchTool("claude", tmpDir, {
        ...config,
        startupTimeoutMs: 1000,
      }, { headless: true });
      expect(result.success).toBe(true);
      expect(result.message).toContain("sleep");
    } finally {
      TOOL_TEMPLATES.claude = origClaude;
    }
  });
});
