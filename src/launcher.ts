import { spawn } from "node:child_process";
import type { Config, LaunchResult, ReasonCode } from "./types.js";
import { TOOL_TEMPLATES } from "./types.js";

/**
 * Execute a fixed launch template in the given project directory (Task 1.4 / 2.2).
 *
 * Launch-and-forget model:
 * - Spawns the command as a detached process
 * - Waits briefly to confirm process started (no immediate crash)
 * - Returns success/failure with reason code
 * - Does NOT track the long-running process afterwards
 */
export async function launchTool(
  tool: string,
  projectPath: string,
  config: Config
): Promise<LaunchResult> {
  const startTime = Date.now();

  // Validate tool is allowed
  if (!config.allowedTools.includes(tool as "claude" | "codex")) {
    return {
      success: false,
      reasonCode: "TOOL_NOT_ALLOWED",
      message: `Tool "${tool}" is not in the allowed tools list.`,
      durationMs: Date.now() - startTime,
    };
  }

  // Get command template
  const args = TOOL_TEMPLATES[tool];
  if (!args) {
    return {
      success: false,
      reasonCode: "TOOL_NOT_ALLOWED",
      message: `No template defined for tool "${tool}".`,
      durationMs: Date.now() - startTime,
    };
  }

  const [command, ...commandArgs] = args;

  return new Promise<LaunchResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (result: LaunchResult) => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      }
    };

    // Spawn detached process in project directory
    let child;
    try {
      child = spawn(command, commandArgs, {
        cwd: projectPath,
        detached: true,
        stdio: "ignore",
      });
    } catch (err) {
      settle({
        success: false,
        reasonCode: "SPAWN_ERROR",
        message: `Failed to spawn "${args.join(" ")}": ${err instanceof Error ? err.message : err}`,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    // Handle immediate spawn errors
    const handleError = (err: NodeJS.ErrnoException) => {
      const reasonCode: ReasonCode =
        err.code === "ENOENT" ? "TOOL_BINARY_NOT_FOUND" : "SPAWN_ERROR";
      settle({
        success: false,
        reasonCode,
        message: `Command "${args.join(" ")}" failed: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    };

    // Handle early exit (process crashed immediately)
    const handleExit = (code: number | null) => {
      settle({
        success: false,
        reasonCode: "SPAWN_ERROR",
        message: `Command "${args.join(" ")}" exited immediately with code ${code}.`,
        durationMs: Date.now() - startTime,
      });
    };

    child.on("error", handleError);
    child.on("exit", handleExit);

    // If no error/exit within check window, consider it launched
    const checkMs = Math.min(2000, config.startupTimeoutMs);
    timer = setTimeout(() => {
      child.removeListener("error", handleError);
      child.removeListener("exit", handleExit);
      try {
        child.unref();
      } catch {
        // ignore
      }
      settle({
        success: true,
        message: `Launched "${args.join(" ")}" in ${projectPath}`,
        durationMs: Date.now() - startTime,
      });
    }, checkMs);
  });
}
