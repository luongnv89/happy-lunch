#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { spawn } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { loadConfig } from "./config.js";
import { listProjects, resolveProject } from "./workspace.js";
import { launchTool, listSessions, stopSession } from "./launcher.js";
import { TOOL_TEMPLATES } from "./types.js";
import type { Config } from "./types.js";

const PID_FILE = ".happy-lunch-bot.pid";

// ── Helpers ──

function getConfigPath(): string {
  return process.env.CONFIG_PATH || path.resolve("config.json");
}

function tryLoadConfig(): Config {
  const configPath = getConfigPath();
  return loadConfig(configPath);
}

function pidFilePath(): string {
  return path.resolve(PID_FILE);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function promptNumber(
  rl: readline.Interface,
  question: string
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

// ── Commands ──

function printHelp(): void {
  console.log(`
happycli — CLI for Happy Lunch bot

Usage:
  happycli <command> [options]

Commands:
  projects          List available projects
  launch            Interactive: pick project → pick tool → launch
  launch <project>  Launch with default tool for a project
  launch <project> <tool>
                    Launch a specific tool for a project
  launch --headless <project> [tool]
                    Launch without opening Terminal.app (background)
  stop              Interactive: pick a running session to stop
  stop <session>    Stop a specific session by name
  stop --all        Stop all running sessions
  sessions          List running sessions
  bot start         Start the bot as a background process
  bot stop          Stop the running bot
  config            Print current configuration
  logs              Show last 20 audit log entries
  status            Show bot and workspace status
  --help, -h        Show this help message
`);
}

function cmdProjects(): void {
  const config = tryLoadConfig();
  const projects = listProjects(config);
  if (projects.length === 0) {
    console.log("No projects found in workspace.");
    return;
  }
  console.log(`Projects in ${config.workspaceRoot}:\n`);
  for (const p of projects) {
    console.log(`  ${p}`);
  }
  console.log(`\n${projects.length} project(s) found.`);
}

async function cmdLaunch(projectArg?: string, toolArg?: string, headless = false): Promise<void> {
  const config = tryLoadConfig();

  let projectName: string;
  let toolName: string;

  if (projectArg) {
    // Direct mode
    projectName = projectArg;
    toolName = toolArg || config.allowedTools[0];
  } else {
    // Interactive mode
    if (!process.stdin.isTTY) {
      console.error(
        "Error: Interactive mode requires a TTY. Provide project name as argument."
      );
      process.exit(1);
    }

    const projects = listProjects(config);
    if (projects.length === 0) {
      console.error("No projects found in workspace.");
      process.exit(1);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // Select project
      console.log("Available projects:\n");
      for (let i = 0; i < projects.length; i++) {
        console.log(`  [${i + 1}] ${projects[i]}`);
      }
      console.log();

      const projInput = await promptNumber(rl, "Select project number: ");
      const projIndex = parseInt(projInput, 10) - 1;
      if (isNaN(projIndex) || projIndex < 0 || projIndex >= projects.length) {
        console.error("Invalid selection.");
        process.exit(1);
      }
      projectName = projects[projIndex];

      // Select tool
      const tools = config.allowedTools;
      console.log("\nAvailable tools:\n");
      for (let i = 0; i < tools.length; i++) {
        const tmpl = TOOL_TEMPLATES[tools[i]];
        console.log(`  [${i + 1}] ${tools[i]} (${tmpl?.join(" ") || "?"})`);
      }
      console.log();

      const toolInput = await promptNumber(rl, "Select tool number: ");
      const toolIndex = parseInt(toolInput, 10) - 1;
      if (isNaN(toolIndex) || toolIndex < 0 || toolIndex >= tools.length) {
        console.error("Invalid selection.");
        process.exit(1);
      }
      toolName = tools[toolIndex];
    } finally {
      rl.close();
    }
  }

  // Resolve and launch
  const resolved = resolveProject(projectName, config);
  if ("error" in resolved) {
    console.error(`Error: ${resolved.error} — project "${projectName}"`);
    process.exit(1);
  }

  console.log(`Launching "${toolName}" in ${resolved.path}${headless ? " (headless)" : ""}...`);
  const result = await launchTool(toolName, resolved.path, config, { headless });

  if (result.success) {
    console.log(`OK: ${result.message}`);
  } else {
    console.error(`FAILED: ${result.message}`);
    process.exit(1);
  }
}

function cmdSessions(): void {
  const sessions = listSessions();
  if (sessions.length === 0) {
    console.log("No running sessions.");
    return;
  }
  console.log(`Running sessions:\n`);
  for (const s of sessions) {
    console.log(`  ${s.name}  (project: ${s.project}, tool: ${s.tool})`);
  }
  console.log(`\n${sessions.length} session(s) running.`);
}

async function cmdStop(sessionArg?: string, all = false): Promise<void> {
  if (all) {
    const sessions = listSessions();
    if (sessions.length === 0) {
      console.log("No running sessions.");
      return;
    }
    for (const s of sessions) {
      const result = stopSession(s.name);
      console.log(result.message);
    }
    return;
  }

  if (sessionArg) {
    const result = stopSession(sessionArg);
    if (result.success) {
      console.log(result.message);
    } else {
      console.error(result.message);
      process.exit(1);
    }
    return;
  }

  // Interactive mode
  if (!process.stdin.isTTY) {
    console.error(
      "Error: Interactive mode requires a TTY. Provide session name as argument."
    );
    process.exit(1);
  }

  const sessions = listSessions();
  if (sessions.length === 0) {
    console.log("No running sessions.");
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("Running sessions:\n");
    for (let i = 0; i < sessions.length; i++) {
      console.log(`  [${i + 1}] ${sessions[i].name}  (${sessions[i].project} / ${sessions[i].tool})`);
    }
    console.log();

    const input = await promptNumber(rl, "Select session to stop (number): ");
    const index = parseInt(input, 10) - 1;
    if (isNaN(index) || index < 0 || index >= sessions.length) {
      console.error("Invalid selection.");
      process.exit(1);
    }

    const result = stopSession(sessions[index].name);
    console.log(result.message);
  } finally {
    rl.close();
  }
}

function cmdBotStart(): void {
  const config = tryLoadConfig();

  // Check if already running
  const pidPath = pidFilePath();
  if (fs.existsSync(pidPath)) {
    const existingPid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
    if (!isNaN(existingPid) && isProcessAlive(existingPid)) {
      console.log(`Bot is already running (PID ${existingPid}).`);
      return;
    }
    // Stale PID file
    fs.unlinkSync(pidPath);
  }

  // Validate token
  loadEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error(
      "Error: TELEGRAM_BOT_TOKEN is not set in environment or .env file."
    );
    process.exit(1);
  }

  // Spawn bot as detached process
  const entryPoint = path.resolve(__dirname, "index.js");
  const child = spawn(process.execPath, [entryPoint], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, CONFIG_PATH: getConfigPath() },
  });

  child.unref();

  if (child.pid) {
    fs.writeFileSync(pidPath, String(child.pid), "utf-8");
    console.log(`Bot started (PID ${child.pid}).`);
  } else {
    console.error("Failed to start bot process.");
    process.exit(1);
  }
}

function cmdBotStop(): void {
  const pidPath = pidFilePath();
  if (!fs.existsSync(pidPath)) {
    console.log("Bot is not running (no PID file found).");
    return;
  }

  const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
  if (isNaN(pid)) {
    console.error("Invalid PID file. Removing it.");
    fs.unlinkSync(pidPath);
    return;
  }

  if (!isProcessAlive(pid)) {
    console.log("Bot process is not running. Cleaning up PID file.");
    fs.unlinkSync(pidPath);
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to bot (PID ${pid}).`);
  } catch (err) {
    console.error(
      `Failed to stop bot: ${err instanceof Error ? err.message : err}`
    );
  }

  fs.unlinkSync(pidPath);
}

function cmdConfig(): void {
  const config = tryLoadConfig();
  console.log("Current configuration:\n");
  console.log(`  Config file:      ${getConfigPath()}`);
  console.log(`  Workspace root:   ${config.workspaceRoot}`);
  console.log(`  Allowed users:    ${config.allowedTelegramUsers.join(", ")}`);
  console.log(`  Allowed tools:    ${config.allowedTools.join(", ")}`);
  console.log(`  Startup timeout:  ${config.startupTimeoutMs}ms`);
  console.log(`  Audit log dir:    ${config.auditLogDir}`);
}

function cmdLogs(): void {
  const config = tryLoadConfig();
  const logFile = path.join(config.auditLogDir, "audit.jsonl");

  if (!fs.existsSync(logFile)) {
    console.log("No audit log file found.");
    return;
  }

  const content = fs.readFileSync(logFile, "utf-8").trim();
  if (!content) {
    console.log("Audit log is empty.");
    return;
  }

  const lines = content.split("\n");
  const last20 = lines.slice(-20);

  console.log(`Last ${last20.length} audit log entries:\n`);
  for (const line of last20) {
    try {
      const entry = JSON.parse(line);
      const ts = entry.ts || "?";
      const project = entry.selectedProject || "-";
      const tool = entry.selectedTool || "-";
      const result = entry.result || "?";
      console.log(`  [${ts}] ${project} / ${tool} → ${result}`);
    } catch {
      console.log(`  (unparseable) ${line.slice(0, 80)}`);
    }
  }
}

function cmdStatus(): void {
  // Bot status
  const pidPath = pidFilePath();
  let botStatus = "stopped";
  if (fs.existsSync(pidPath)) {
    const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
    if (!isNaN(pid) && isProcessAlive(pid)) {
      botStatus = `running (PID ${pid})`;
    } else {
      botStatus = "stopped (stale PID file)";
    }
  }
  console.log(`Bot status: ${botStatus}`);

  // Config info
  try {
    const config = tryLoadConfig();
    const projects = listProjects(config);
    console.log(`Workspace:   ${config.workspaceRoot}`);
    console.log(`Projects:    ${projects.length}`);
    console.log(`Tools:       ${config.allowedTools.join(", ")}`);
  } catch (err) {
    console.log(
      `Config:      error — ${err instanceof Error ? err.message : err}`
    );
  }
}

// ── Main ──

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;

    case "projects":
      cmdProjects();
      break;

    case "launch": {
      const launchArgs = args.slice(1);
      const headless = launchArgs.includes("--headless");
      const positional = launchArgs.filter((a) => a !== "--headless");
      await cmdLaunch(positional[0], positional[1], headless);
      break;
    }

    case "sessions":
      cmdSessions();
      break;

    case "stop": {
      const stopArgs = args.slice(1);
      const allFlag = stopArgs.includes("--all");
      const positional = stopArgs.filter((a) => a !== "--all");
      await cmdStop(positional[0], allFlag);
      break;
    }

    case "bot":
      if (args[1] === "start") {
        cmdBotStart();
      } else if (args[1] === "stop") {
        cmdBotStop();
      } else {
        console.error(
          `Unknown bot subcommand: ${args[1] || "(none)"}. Use "bot start" or "bot stop".`
        );
        process.exit(1);
      }
      break;

    case "config":
      cmdConfig();
      break;

    case "logs":
      cmdLogs();
      break;

    case "status":
      cmdStatus();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
