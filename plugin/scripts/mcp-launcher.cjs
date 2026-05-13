#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const SERVER_REL = path.join("scripts", "mcp-server.cjs");

function newestVersionDir(root) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return null; }
  const dirs = [];
  for (const e of entries) {
    if (!e.isDirectory() || !/^\d/.test(e.name)) continue;
    const full = path.join(root, e.name);
    try { dirs.push({ full, mtime: fs.statSync(full).mtimeMs }); } catch {}
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  return dirs[0] ? dirs[0].full : null;
}

function candidateRoots() {
  const home = os.homedir();
  const claude = process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  return [
    process.env.CLAUDE_PLUGIN_ROOT,
    process.env.PLUGIN_ROOT,
    path.join(process.cwd(), "plugin"),
    process.cwd(),
    newestVersionDir(path.join(home, ".codex", "plugins", "cache", "claude-mem-local", "claude-mem")),
    newestVersionDir(path.join(home, ".codex", "plugins", "cache", "thedotmack", "claude-mem")),
    newestVersionDir(path.join(claude, "plugins", "cache", "thedotmack", "claude-mem")),
    path.join(claude, "plugins", "marketplaces", "thedotmack", "plugin"),
  ].filter(Boolean);
}

function resolveServer(root) {
  const nested = path.join(root, "plugin", SERVER_REL);
  if (fs.existsSync(nested)) return nested;
  const flat = path.join(root, SERVER_REL);
  return fs.existsSync(flat) ? flat : null;
}

const serverPath = candidateRoots().map(resolveServer).find(Boolean);
if (!serverPath) {
  console.error("claude-mem: mcp server not found");
  process.exit(1);
}

try {
  require(serverPath);
} catch {
  const child = spawn(process.execPath, [serverPath], { stdio: "inherit" });
  child.on("error", (err) => { console.error(err.message); process.exit(1); });
  child.on("exit", (code, signal) => {
    if (signal) { try { process.kill(process.pid, signal); } catch { process.exit(1); } return; }
    process.exit(code == null ? 0 : code);
  });
}
