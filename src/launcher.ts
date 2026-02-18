import { spawn, execFile, execFileSync } from "node:child_process";
import * as os from "node:os";
import type { Config, LaunchResult, ReasonCode } from "./types.js";
import { TOOL_TEMPLATES } from "./types.js";

export interface SessionInfo {
  name: string;
  /** Parsed project name from the session name (happy-<project>-<tool>) */
  project: string;
  /** Parsed tool name from the session name */
  tool: string;
}

/**
 * List running happy-lunch tmux sessions.
 */
export function listSessions(): SessionInfo[] {
  try {
    const output = execFileSync("tmux", ["list-sessions", "-F", "#{session_name}"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output
      .trim()
      .split("\n")
      .filter((name) => name.startsWith("happy-"))
      .map((name) => {
        // Parse happy-<project>-<tool>
        const parts = name.split("-");
        const tool = parts[parts.length - 1];
        const project = parts.slice(1, -1).join("-");
        return { name, project, tool };
      });
  } catch {
    // tmux not running or no sessions
    return [];
  }
}

/**
 * Stop a running tmux session by name.
 * Returns true if the session was killed, false otherwise.
 */
export function stopSession(sessionName: string): { success: boolean; message: string } {
  try {
    execFileSync("tmux", ["kill-session", "-t", sessionName], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, message: `Stopped session "${sessionName}".` };
  } catch {
    return { success: false, message: `Session "${sessionName}" not found or already stopped.` };
  }
}

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

  // Headless mode: wrap in tmux so the tool gets a real TTY
  if (options.headless) {
    return launchInTmux(tool, args, projectPath, config, startTime);
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

function tmuxSessionName(tool: string, projectPath: string): string {
  const project = projectPath.split("/").pop() || "project";
  // tmux session names: alphanumeric, dot, underscore, hyphen
  return `happy-${project}-${tool}`.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function launchInTmux(
  tool: string,
  args: string[],
  projectPath: string,
  config: Config,
  startTime: number
): Promise<LaunchResult> {
  const session = tmuxSessionName(tool, projectPath);
  const cmdString = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");

  // Clean environment: remove vars that prevent nested Claude Code sessions
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  return new Promise<LaunchResult>((resolve) => {
    // Kill existing session with the same name (if any) to avoid conflicts
    execFile("tmux", ["kill-session", "-t", session], () => {
      // Ignore errors — session may not exist
      const child = spawn(
        "tmux",
        ["new-session", "-d", "-s", session, "-c", projectPath, cmdString],
        { detached: true, stdio: "ignore", env: cleanEnv }
      );

      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const settle = (result: LaunchResult) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(result);
        }
      };

      child.on("error", (err: NodeJS.ErrnoException) => {
        const reasonCode: ReasonCode =
          err.code === "ENOENT" ? "TOOL_BINARY_NOT_FOUND" : "SPAWN_ERROR";
        settle({
          success: false,
          reasonCode,
          message:
            reasonCode === "TOOL_BINARY_NOT_FOUND"
              ? `tmux not found. Install it with: brew install tmux`
              : `Failed to start tmux session: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });

      child.on("exit", (code) => {
        if (code === 0) {
          settle({
            success: true,
            message: `Launched "${args.join(" ")}" in tmux session "${session}" at ${projectPath}. Attach with: tmux attach -t ${session}`,
            durationMs: Date.now() - startTime,
          });
        } else {
          settle({
            success: false,
            reasonCode: "SPAWN_ERROR",
            message: `tmux exited with code ${code}. Session: ${session}`,
            durationMs: Date.now() - startTime,
          });
        }
      });

      const checkMs = Math.min(2000, config.startupTimeoutMs);
      timer = setTimeout(() => {
        child.removeListener("error", () => {});
        child.removeListener("exit", () => {});
        try { child.unref(); } catch { /* ignore */ }
        settle({
          success: true,
          message: `Launched "${args.join(" ")}" in tmux session "${session}" at ${projectPath}. Attach with: tmux attach -t ${session}`,
          durationMs: Date.now() - startTime,
        });
      }, checkMs);
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
