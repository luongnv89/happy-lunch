import { spawn, execFile, execFileSync } from "node:child_process";
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

/**
 * Execute a fixed launch template in the given project directory.
 *
 * Always launches inside a named tmux session so the tool gets a real TTY.
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

  return launchInTmux(tool, args, projectPath, config, startTime);
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
