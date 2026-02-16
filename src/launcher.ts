import { spawn, execFile } from "node:child_process";
import * as os from "node:os";
import type { Config, LaunchResult, ReasonCode } from "./types.js";
import { TOOL_TEMPLATES } from "./types.js";

export interface LaunchOptions {
  /** Skip Terminal.app and spawn detached (no TTY). Defaults to false. */
  headless?: boolean;
}

/**
 * Execute a fixed launch template in the given project directory (Task 1.4 / 2.2).
 *
 * On macOS, opens a new Terminal.app window so the tool gets a real TTY,
 * unless `options.headless` is true — in which case it spawns detached
 * with stdio ignored (same as non-macOS platforms).
 */
export async function launchTool(
  tool: string,
  projectPath: string,
  config: Config,
  options: LaunchOptions = {}
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

  // On macOS, open in a new Terminal.app window for a real TTY
  // unless headless mode is requested (e.g. from Telegram bot)
  if (os.platform() === "darwin" && !options.headless) {
    return launchInTerminalApp(args, projectPath, startTime);
  }

  return launchDetached(args, projectPath, config, startTime);
}

function launchInTerminalApp(
  args: string[],
  projectPath: string,
  startTime: number
): Promise<LaunchResult> {
  const cmdString = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
  const script = `tell application "Terminal"
  activate
  do script "cd '${projectPath.replace(/'/g, "'\\''")}' && ${cmdString}"
end tell`;

  return new Promise<LaunchResult>((resolve) => {
    execFile("osascript", ["-e", script], (err) => {
      if (err) {
        resolve({
          success: false,
          reasonCode: "SPAWN_ERROR",
          message: `Failed to open Terminal.app: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      } else {
        resolve({
          success: true,
          message: `Opened "${args.join(" ")}" in new Terminal window at ${projectPath}`,
          durationMs: Date.now() - startTime,
        });
      }
    });
  });
}

function launchDetached(
  args: string[],
  projectPath: string,
  config: Config,
  startTime: number
): Promise<LaunchResult> {
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
