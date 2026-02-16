import TelegramBot from "node-telegram-bot-api";
import type {
  Config,
  ConversationState,
  ReasonCode,
} from "./types.js";
import { TOOL_TEMPLATES } from "./types.js";
import { listProjects, resolveProject } from "./workspace.js";
import { launchTool } from "./launcher.js";
import { writeAuditLog, createAuditEntry } from "./audit.js";

// Per-chat conversation state
const conversations = new Map<number, ConversationState>();

function getState(chatId: number): ConversationState {
  let state = conversations.get(chatId);
  if (!state) {
    state = { step: "idle" };
    conversations.set(chatId, state);
  }
  return state;
}

function resetState(chatId: number): void {
  conversations.set(chatId, { step: "idle" });
}

function isAuthorized(userId: number, config: Config): boolean {
  return config.allowedTelegramUsers.includes(userId);
}

function reasonLabel(code: ReasonCode): string {
  const labels: Record<ReasonCode, string> = {
    UNAUTHORIZED_USER: "Unauthorized user",
    PROJECT_NOT_FOUND: "Project not found",
    PATH_DENIED: "Path outside workspace boundary",
    TOOL_NOT_ALLOWED: "Tool not in allowlist",
    TOOL_BINARY_NOT_FOUND: "Tool binary not found on this machine",
    SPAWN_ERROR: "Failed to start the process",
    STARTUP_TIMEOUT: "Process timed out during startup",
  };
  return labels[code] || code;
}

export function createBot(token: string, config: Config): TelegramBot {
  const bot = new TelegramBot(token, { polling: true });

  // Register commands so Telegram shows them when user types "/"
  bot.setMyCommands([
    { command: "launch", description: "Start a Happy session" },
    { command: "projects", description: "List available projects" },
    { command: "status", description: "Show current state" },
    { command: "cancel", description: "Cancel current flow" },
  ]);

  // --- /start command ---
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !isAuthorized(userId, config)) {
      handleUnauthorized(bot, chatId, userId, config);
      return;
    }

    resetState(chatId);
    bot.sendMessage(
      chatId,
      "Welcome to Happy Launcher!\n\nCommands:\n/launch — Start a Happy session\n/projects — List available projects\n/status — Show current state\n/cancel — Cancel current flow"
    );
  });

  // --- /projects command ---
  bot.onText(/\/projects/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !isAuthorized(userId, config)) {
      handleUnauthorized(bot, chatId, userId, config);
      return;
    }

    const projects = listProjects(config);
    if (projects.length === 0) {
      bot.sendMessage(chatId, "No projects found under workspace root.");
      return;
    }

    const list = projects.map((p) => `  - ${p}`).join("\n");
    bot.sendMessage(chatId, `Projects:\n${list}`);
  });

  // --- /launch command ---
  bot.onText(/\/launch/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !isAuthorized(userId, config)) {
      handleUnauthorized(bot, chatId, userId, config);
      return;
    }

    const projects = listProjects(config);
    if (projects.length === 0) {
      bot.sendMessage(chatId, "No projects found under workspace root.");
      return;
    }

    // Store project list in state and use index-based callback_data
    const state = getState(chatId);
    state.step = "select_project";
    state.projectOptions = projects;

    const keyboard = projects.map((p, i) => [
      { text: p, callback_data: `p:${i}` },
    ]);

    bot.sendMessage(chatId, "Select a project:", {
      reply_markup: { inline_keyboard: keyboard },
    });
  });

  // --- /status command ---
  bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !isAuthorized(userId, config)) {
      handleUnauthorized(bot, chatId, userId, config);
      return;
    }

    const state = getState(chatId);
    const lines = [`Step: ${state.step}`];
    if (state.selectedProject) lines.push(`Project: ${state.selectedProject}`);
    if (state.selectedTool) lines.push(`Tool: ${state.selectedTool}`);
    bot.sendMessage(chatId, lines.join("\n"));
  });

  // --- /cancel command ---
  bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !isAuthorized(userId, config)) {
      handleUnauthorized(bot, chatId, userId, config);
      return;
    }

    resetState(chatId);
    bot.sendMessage(chatId, "Cancelled. Use /launch to start over.");
  });

  // --- Callback query handler (inline keyboard presses) ---
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    const userId = query.from.id;
    const data = query.data;

    if (!chatId || !data) {
      bot.answerCallbackQuery(query.id);
      return;
    }

    if (!isAuthorized(userId, config)) {
      handleUnauthorized(bot, chatId, userId, config);
      bot.answerCallbackQuery(query.id);
      return;
    }

    const state = getState(chatId);
    bot.answerCallbackQuery(query.id);

    // --- Project selection step (index-based) ---
    if (state.step === "select_project" && data.startsWith("p:")) {
      const index = parseInt(data.slice(2), 10);
      const projectName = state.projectOptions?.[index];

      if (!projectName) {
        bot.sendMessage(chatId, "Invalid selection. Use /launch to try again.");
        resetState(chatId);
        return;
      }

      // Validate the project path
      const resolved = resolveProject(projectName, config);
      if ("error" in resolved) {
        const entry = createAuditEntry(userId, chatId);
        entry.selectedProject = projectName;
        entry.result = "failure";
        entry.reasonCode = resolved.error;
        writeAuditLog(entry, config);

        bot.sendMessage(
          chatId,
          `Error: ${reasonLabel(resolved.error)}\nUse /launch to try again.`
        );
        resetState(chatId);
        return;
      }

      // Store resolved path in state to avoid re-resolving later
      state.selectedProject = projectName;
      state.resolvedProjectPath = resolved.path;
      state.step = "select_tool";

      const keyboard = config.allowedTools.map((t) => {
        const templateArgs = TOOL_TEMPLATES[t];
        const label = templateArgs ? `${t} (${templateArgs.join(" ")})` : t;
        return [{ text: label, callback_data: `t:${t}` }];
      });

      bot.sendMessage(
        chatId,
        `Project: ${projectName}\nSelect a tool:`,
        { reply_markup: { inline_keyboard: keyboard } }
      );
      return;
    }

    // --- Tool selection step ---
    if (state.step === "select_tool" && data.startsWith("t:")) {
      const tool = data.slice(2);
      state.selectedTool = tool;

      // Validate state integrity
      if (!state.selectedProject || !state.resolvedProjectPath) {
        bot.sendMessage(chatId, "Session expired. Use /launch to start over.");
        resetState(chatId);
        return;
      }

      const projectName = state.selectedProject;
      const projectPath = state.resolvedProjectPath;
      const templateArgs = TOOL_TEMPLATES[tool];
      const templateStr = templateArgs ? templateArgs.join(" ") : tool;

      bot.sendMessage(
        chatId,
        `Launching "${templateStr}" in ${projectName}...`
      );

      // Execute the launch (headless — bot has no terminal)
      const result = await launchTool(tool, projectPath, config, { headless: true });

      // Build and write audit entry
      const entry = createAuditEntry(userId, chatId);
      entry.selectedProject = projectName;
      entry.resolvedProjectPath = projectPath;
      entry.selectedTool = tool;
      entry.commandTemplate = templateStr;
      entry.result = result.success ? "success" : "failure";
      entry.reasonCode = result.reasonCode ?? null;
      entry.durationMs = result.durationMs;
      writeAuditLog(entry, config);

      // Send result to user
      if (result.success) {
        bot.sendMessage(chatId, `Launched successfully!\n${result.message}`);
      } else {
        const reason = result.reasonCode
          ? reasonLabel(result.reasonCode)
          : "Unknown error";
        bot.sendMessage(
          chatId,
          `Launch failed: ${reason}\n${result.message}\nUse /launch to try again.`
        );
      }

      resetState(chatId);
      return;
    }
  });

  return bot;
}

// --- Helpers ---

function handleUnauthorized(
  bot: TelegramBot,
  chatId: number,
  userId: number | undefined,
  config: Config
): void {
  bot.sendMessage(chatId, "Access denied. You are not authorized to use this bot.");

  if (userId) {
    const entry = createAuditEntry(userId, chatId);
    entry.result = "denied";
    entry.reasonCode = "UNAUTHORIZED_USER";
    writeAuditLog(entry, config);
  }
}
