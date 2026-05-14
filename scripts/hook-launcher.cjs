#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const CONTINUE_OK = '{"continue":true,"suppressOutput":true}';

const DISPATCH = {
  "version-check": ["scripts/version-check.js"],
  "worker-start":  ["scripts/bun-runner.js", "scripts/worker-service.cjs", "start"],
  "context":       ["scripts/bun-runner.js", "scripts/worker-service.cjs", "hook", "claude-code", "context"],
  "session-init":  ["scripts/bun-runner.js", "scripts/worker-service.cjs", "hook", "claude-code", "session-init"],
  "observation":   ["scripts/bun-runner.js", "scripts/worker-service.cjs", "hook", "claude-code", "observation"],
  "file-context":  ["scripts/bun-runner.js", "scripts/worker-service.cjs", "hook", "claude-code", "file-context"],
  "summarize":     ["scripts/bun-runner.js", "scripts/worker-service.cjs", "hook", "claude-code", "summarize"],
};

function bailContinue() {
  process.stdout.write(CONTINUE_OK + "\n");
  process.exit(0);
}

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

function pluginRoot() {
  const home = os.homedir();
  const claude = process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  const probe = path.join("scripts", "bun-runner.js");
  const candidates = [
    process.env.CLAUDE_PLUGIN_ROOT,
    process.env.PLUGIN_ROOT,
    path.join(process.cwd(), "plugin"),
    process.cwd(),
    newestVersionDir(path.join(claude, "plugins", "cache", "thedotmack", "claude-mem")),
    path.join(claude, "plugins", "marketplaces", "thedotmack", "plugin"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "plugin", probe))) return path.join(c, "plugin");
    if (fs.existsSync(path.join(c, probe))) return c;
  }
  return null;
}

const hookType = process.argv[2];
const tail = DISPATCH[hookType];
if (!tail) { console.error(`hook-launcher: unknown hook '${hookType}'`); bailContinue(); }

const root = pluginRoot();
if (!root) { console.error("hook-launcher: plugin root not found"); bailContinue(); }

const argv = tail.map((rel) => path.join(root, rel));
const child = spawn(process.execPath, argv, { stdio: "inherit" });

child.on("error", (err) => { console.error(`hook-launcher: ${err.message}`); bailContinue(); });
child.on("exit", (code, signal) => {
  if (hookType === "worker-start") process.stdout.write(CONTINUE_OK + "\n");
  if (signal) { try { process.kill(process.pid, signal); } catch { process.exit(0); } return; }
  process.exit(code == null ? 0 : code);
});
