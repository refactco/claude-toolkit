#!/usr/bin/env node
// List plugins with an available update on staging, minus excludePlugins.
//
//   node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/check-updates.mjs [--env staging] [--format json|table]
//
// Output (json, default): array of { name, status, version, update_version }.
// Queries the LIVE install over WP-CLI — never a git diff (plugins aren't tracked).
// If WP-CLI emits output that can't be parsed as JSON, it fails LOUDLY (non-zero
// exit) rather than silently reporting "no updates".

import { spawnSync } from "node:child_process";
import { loadConfig, getEnv, buildSshArgv } from "./lib/config.mjs";

const BIG = 16 * 1024 * 1024;

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

/** Parse JSON from possibly-noisy WP-CLI stdout. Returns parsed value or null. */
function extractJson(text) {
  if (!text || !text.trim()) return null;
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  // 1. whole string
  let v = tryParse(text.trim());
  if (v !== undefined) return v;
  // 2. the last line that begins with a JSON token (WP-CLI prints the doc on its own line)
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      v = tryParse(t);
      if (v !== undefined) return v;
    }
  }
  // 3. first-bracket .. matching-last-bracket slice
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (start !== -1 && end > start) {
    v = tryParse(text.slice(start, end + 1));
    if (v !== undefined) return v;
  }
  return null;
}

function main() {
  const envName = arg("--env", "staging");
  const format = arg("--format", "json");
  const config = loadConfig();
  const env = getEnv(config, envName);
  const exclude = new Set(config.excludePlugins || []);

  const { file, args } = buildSshArgv(env, [
    "plugin", "list", "--update=available",
    "--fields=name,status,version,update_version", "--format=json",
  ]);
  const res = spawnSync(file, args, { encoding: "utf8", maxBuffer: BIG });
  if (res.status !== 0 && !res.stdout) {
    process.stderr.write(`check-updates: WP-CLI failed (exit ${res.status}).\n${res.stderr || ""}\n`);
    process.exit(res.status || 1);
  }

  const parsed = extractJson(res.stdout || "");
  if (parsed === null) {
    // Non-empty but unparseable — do NOT pretend there are no updates.
    process.stderr.write(`check-updates: could not parse WP-CLI JSON output. Raw stdout:\n${res.stdout}\n`);
    process.exit(1);
  }
  const list = Array.isArray(parsed) ? parsed : [];
  const updates = list.filter((p) => !exclude.has(p.name));

  if (format === "table") {
    if (updates.length === 0) {
      process.stdout.write("No plugin updates available (excluding: " + [...exclude].join(", ") + ").\n");
      return;
    }
    const rows = updates.map((p) => `${p.name}\t${p.status}\t${p.version} -> ${p.update_version}`);
    process.stdout.write(["name\tstatus\tversion", ...rows].join("\n") + "\n");
  } else {
    process.stdout.write(JSON.stringify(updates, null, 2) + "\n");
  }
}

try {
  main();
} catch (e) {
  process.stderr.write(`check-updates: ${e.message}\n`);
  process.exit(1);
}
