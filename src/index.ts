import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { loadConfig } from "./config.js";
import { createBot } from "./bot.js";

// Load .env for TELEGRAM_BOT_TOKEN
loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Error: TELEGRAM_BOT_TOKEN is not set in environment or .env file.");
  process.exit(1);
}

// Load and validate config
const configPath = process.env.CONFIG_PATH || path.resolve("config.json");
let config;
try {
  config = loadConfig(configPath);
} catch (err) {
  console.error(
    `Startup error: ${err instanceof Error ? err.message : err}`
  );
  process.exit(1);
}

console.log("Configuration loaded successfully:");
console.log(`  Workspace root: ${config.workspaceRoot}`);
console.log(`  Allowed users: ${config.allowedTelegramUsers.join(", ")}`);
console.log(`  Allowed tools: ${config.allowedTools.join(", ")}`);
console.log(`  Startup timeout: ${config.startupTimeoutMs}ms`);
console.log(`  Audit log dir: ${config.auditLogDir}`);

// Start the bot
const bot = createBot(token, config);
console.log("Happy Launcher bot is running. Press Ctrl+C to stop.");

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  bot.stopPolling();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down...");
  bot.stopPolling();
  process.exit(0);
});
