import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { listProjects, resolveProject } from "../src/workspace.js";
import type { Config } from "../src/types.js";

let tmpDir: string;
let workspaceDir: string;
let config: Config;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "happy-ws-"));
  // Keep workspace and logs separate so logs dir doesn't appear in project listing
  workspaceDir = path.join(tmpDir, "workspace");
  fs.mkdirSync(workspaceDir);
  config = {
    workspaceRoot: fs.realpathSync(workspaceDir),
    allowedTelegramUsers: [1],
    allowedTools: ["claude"],
    startupTimeoutMs: 8000,
    auditLogDir: path.join(tmpDir, "logs"),
  };
  fs.mkdirSync(config.auditLogDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("listProjects", () => {
  it("returns empty array for empty workspace", () => {
    expect(listProjects(config)).toEqual([]);
  });

  it("lists only directories, not files", () => {
    fs.mkdirSync(path.join(workspaceDir, "project-a"));
    fs.writeFileSync(path.join(workspaceDir, "readme.txt"), "hello");
    const projects = listProjects(config);
    expect(projects).toEqual(["project-a"]);
  });

  it("excludes hidden directories", () => {
    fs.mkdirSync(path.join(workspaceDir, ".git"));
    fs.mkdirSync(path.join(workspaceDir, ".vscode"));
    fs.mkdirSync(path.join(workspaceDir, "my-project"));
    const projects = listProjects(config);
    expect(projects).toEqual(["my-project"]);
  });

  it("returns sorted directory names", () => {
    fs.mkdirSync(path.join(workspaceDir, "zulu"));
    fs.mkdirSync(path.join(workspaceDir, "alpha"));
    fs.mkdirSync(path.join(workspaceDir, "mike"));
    expect(listProjects(config)).toEqual(["alpha", "mike", "zulu"]);
  });
});

describe("resolveProject", () => {
  it("resolves a valid project directory", () => {
    fs.mkdirSync(path.join(workspaceDir, "my-app"));
    const result = resolveProject("my-app", config);
    expect(result).toHaveProperty("path");
    expect("path" in result && result.path).toContain("my-app");
  });

  it("returns PROJECT_NOT_FOUND for missing directory", () => {
    const result = resolveProject("nonexistent", config);
    expect(result).toEqual({ error: "PROJECT_NOT_FOUND" });
  });

  it("returns PATH_DENIED for traversal attempt with ..", () => {
    const result = resolveProject("../../../etc", config);
    expect(result).toEqual({ error: "PATH_DENIED" });
  });

  it("returns PATH_DENIED for names with unsafe characters", () => {
    expect(resolveProject("foo;bar", config)).toEqual({ error: "PATH_DENIED" });
    expect(resolveProject("foo bar", config)).toEqual({ error: "PATH_DENIED" });
    expect(resolveProject("foo/bar", config)).toEqual({ error: "PATH_DENIED" });
    expect(resolveProject("", config)).toEqual({ error: "PATH_DENIED" });
  });

  it("allows names with dots, dashes, underscores", () => {
    fs.mkdirSync(path.join(workspaceDir, "my-app_v2.0"));
    const result = resolveProject("my-app_v2.0", config);
    expect(result).toHaveProperty("path");
  });

  it("returns PROJECT_NOT_FOUND for a file (not directory)", () => {
    fs.writeFileSync(path.join(workspaceDir, "not-a-dir"), "data");
    const result = resolveProject("not-a-dir", config);
    expect(result).toEqual({ error: "PROJECT_NOT_FOUND" });
  });

  it("returns PATH_DENIED for symlink pointing outside workspace", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "outside-"));
    try {
      fs.symlinkSync(outsideDir, path.join(workspaceDir, "escape-link"));
      const result = resolveProject("escape-link", config);
      expect(result).toEqual({ error: "PATH_DENIED" });
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
