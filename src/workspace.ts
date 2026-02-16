import * as fs from "node:fs";
import * as path from "node:path";
import type { Config } from "./types.js";

// Only allow safe directory name characters
const SAFE_PROJECT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * List project directories under workspaceRoot (Task 1.2).
 * - Only immediate subdirectories that are actual directories
 * - Excludes hidden folders (starting with '.')
 * - Returns sorted directory names
 */
export function listProjects(config: Config): string[] {
  const entries = fs.readdirSync(config.workspaceRoot, {
    withFileTypes: true,
  });

  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

/**
 * Resolve and validate a project path (Task 1.2).
 * Returns the canonical absolute path if valid, or error reason if not.
 */
export function resolveProject(
  projectName: string,
  config: Config
): { path: string } | { error: "PROJECT_NOT_FOUND" | "PATH_DENIED" } {
  // Validate project name contains only safe characters
  if (!SAFE_PROJECT_NAME.test(projectName)) {
    return { error: "PATH_DENIED" };
  }

  // Build candidate path
  const candidate = path.join(config.workspaceRoot, projectName);

  // Canonicalize to prevent traversal (e.g., symlinks pointing outside)
  let resolved: string;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    return { error: "PROJECT_NOT_FOUND" };
  }

  // Boundary check using path.relative() — safer than string prefix matching
  const root = fs.realpathSync(config.workspaceRoot);
  const relativePath = path.relative(root, resolved);

  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return { error: "PATH_DENIED" };
  }

  // Verify it's a directory
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { error: "PROJECT_NOT_FOUND" };
    }
  } catch {
    return { error: "PROJECT_NOT_FOUND" };
  }

  return { path: resolved };
}
