import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigSchema, type Config } from "./types.js";

export function loadConfig(configPath: string): Config {
  // Check file exists
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  // Parse JSON
  let raw: unknown;
  try {
    const text = fs.readFileSync(configPath, "utf-8");
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Failed to parse config file: ${err instanceof Error ? err.message : err}`
    );
  }

  // Validate with Zod
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  const config = result.data;

  // Validate workspaceRoot exists and is a directory
  const resolvedRoot = path.resolve(config.workspaceRoot);
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`workspaceRoot does not exist: ${resolvedRoot}`);
  }

  const stat = fs.statSync(resolvedRoot);
  if (!stat.isDirectory()) {
    throw new Error(`workspaceRoot is not a directory: ${resolvedRoot}`);
  }

  // Normalize workspaceRoot to resolved absolute path
  config.workspaceRoot = resolvedRoot;

  // Ensure auditLogDir exists (create if missing) and is writable
  const resolvedLogDir = path.resolve(config.auditLogDir);
  if (!fs.existsSync(resolvedLogDir)) {
    fs.mkdirSync(resolvedLogDir, { recursive: true });
  }

  const testFile = path.join(resolvedLogDir, `.write-test-${Date.now()}`);
  try {
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
  } catch (err) {
    throw new Error(
      `auditLogDir is not writable: ${resolvedLogDir} (${err instanceof Error ? err.message : err})`
    );
  }

  config.auditLogDir = resolvedLogDir;

  return config;
}
