import { z } from "zod";

// --- Config schema (Task 1.1) ---

export const ConfigSchema = z.object({
  workspaceRoot: z.string().min(1, "workspaceRoot must be a non-empty path"),
  allowedTelegramUsers: z
    .array(z.number().int().positive())
    .min(1, "At least one allowed Telegram user is required"),
  allowedTools: z
    .array(z.enum(["claude", "codex"]))
    .min(1, "At least one allowed tool is required"),
  startupTimeoutMs: z
    .number()
    .int()
    .positive()
    .default(8000),
  auditLogDir: z.string().min(1).default("./logs"),
});

export type Config = z.infer<typeof ConfigSchema>;

// --- Tool template mapping (Task 1.4) ---

export const TOOL_TEMPLATES: Record<string, string[]> = {
  claude: ["happy"],
  codex: ["happy", "codex"],
};

// --- Error taxonomy (Task 1.4) ---

export type ReasonCode =
  | "UNAUTHORIZED_USER"
  | "PROJECT_NOT_FOUND"
  | "PATH_DENIED"
  | "TOOL_NOT_ALLOWED"
  | "TOOL_BINARY_NOT_FOUND"
  | "SPAWN_ERROR"
  | "STARTUP_TIMEOUT";

// --- Audit log entry (Task 2.1) ---

export interface AuditEntry {
  ts: string;
  telegramUserId: number;
  chatId: number;
  selectedProject: string | null;
  resolvedProjectPath: string | null;
  selectedTool: string | null;
  commandTemplate: string | null;
  result: "success" | "failure" | "denied";
  reasonCode: ReasonCode | null;
  durationMs: number;
}

// --- Conversation state for deterministic UX (Task 1.3) ---

export type ConversationStep = "idle" | "select_project" | "select_tool" | "select_stop";

export interface ConversationState {
  step: ConversationStep;
  projectOptions?: string[];
  selectedProject?: string;
  resolvedProjectPath?: string;
  selectedTool?: string;
  sessionOptions?: string[];
}

// --- Launch result (Task 1.4 / 2.2) ---

export interface LaunchResult {
  success: boolean;
  reasonCode?: ReasonCode;
  message: string;
  durationMs: number;
}
