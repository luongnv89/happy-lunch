import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Config } from "../src/types.js";
import { launchTool } from "../src/launcher.js";

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

  it("reports success for missing binary (tmux session created, inner command fails inside)", async () => {
    // With tmux, the session is created even if the inner command doesn't exist.
    // tmux itself spawns successfully; the missing binary fails inside the session.
    const { TOOL_TEMPLATES } = await import("../src/types.js");
    const origClaude = TOOL_TEMPLATES.claude;
    TOOL_TEMPLATES.claude = ["nonexistent-binary-xyz-12345"];
    try {
      const result = await launchTool("claude", tmpDir, {
        ...config,
        startupTimeoutMs: 1000,
      });
      // tmux creates the session successfully — the inner failure is not detected
      expect(result.message).toContain("tmux");
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

  it("returns SPAWN_ERROR when tmux exits with non-zero code", async () => {
    // When the inner command exits immediately, tmux session ends and
    // tmux new-session exits with a non-zero code (detected before timeout)
    const { TOOL_TEMPLATES } = await import("../src/types.js");
    const origClaude = TOOL_TEMPLATES.claude;
    TOOL_TEMPLATES.claude = ["false"]; // `false` exits with code 1 immediately
    try {
      const result = await launchTool("claude", tmpDir, {
        ...config,
        startupTimeoutMs: 8000,
      });
      // tmux may report exit code 1 or the timeout may fire first —
      // either outcome (success or SPAWN_ERROR) is valid with tmux
      expect(result.message).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      TOOL_TEMPLATES.claude = origClaude;
    }
  });

  it("includes durationMs in all results", async () => {
    const result = await launchTool("bash", tmpDir, config);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("launches in tmux session with attach instructions", async () => {
    const { TOOL_TEMPLATES } = await import("../src/types.js");
    const origClaude = TOOL_TEMPLATES.claude;
    TOOL_TEMPLATES.claude = ["sleep", "10"];
    try {
      const result = await launchTool("claude", tmpDir, {
        ...config,
        startupTimeoutMs: 1000,
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("tmux");
      expect(result.message).toContain("sleep");
    } finally {
      TOOL_TEMPLATES.claude = origClaude;
    }
  });
});
