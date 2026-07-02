#!/usr/bin/env node
// Data & settings integrity — delta-vs-baseline via WP-CLI. Captures plugin
// versions/active-state, published content counts per post type, and the cron
// queue size BEFORE the update; compares AFTER.
//
//   node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/data-integrity.mjs --env staging --capture   # baseline (with snapshot)
//   node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/data-integrity.mjs --env staging --compare   # after the update
//
// HARD (exit non-zero): a plugin version moved BACKWARD (unintended downgrade),
// an active plugin became inactive, published content count DROPPED (data loss),
// or the cron queue emptied. SOFT: counts up, versions forward, new plugins.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig, getEnv, buildSshArgv, snapshotDir, clearPassRecords } from "./lib/config.mjs";

const BIG = 16 * 1024 * 1024;
const has = (f) => process.argv.includes(f);
const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text.trim()); } catch {}
  const s = text.search(/[[{]/), e = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (s !== -1 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch {} }
  return null;
}

function wp(env, wpArgs) {
  const { file, args } = buildSshArgv(env, wpArgs);
  const res = spawnSync(file, args, { encoding: "utf8", maxBuffer: BIG });
  // Fail loud — a swallowed WP-CLI error must never become an empty baseline
  // that silently attests nothing.
  if (res.error) throw new Error(`data-integrity: WP-CLI spawn failed: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`data-integrity: \`wp ${wpArgs.join(" ")}\` exited ${res.status}: ${(res.stderr || "").trim().slice(0, 200)}`);
  return res.stdout || "";
}

// Suffix-aware: compare numeric cores; on equal cores a prerelease (-rc/-beta)
// sorts BELOW the stable release, so 1.2.0-rc1 → 1.2.0 is NOT a downgrade.
function cmpVer(a, b) {
  const core = (v) => String(v).split(/[-+]/)[0];
  const hasPre = (v) => /[-+]/.test(String(v));
  const pa = core(a).split(/[^\d]+/).filter(Boolean).map(Number);
  const pb = core(b).split(/[^\d]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  const ap = hasPre(a), bp = hasPre(b);
  if (ap && !bp) return -1;
  if (!ap && bp) return 1;
  return 0;
}

function capture(env) {
  const plugins = extractJson(wp(env, ["plugin", "list", "--fields=name,status,version", "--format=json"])) || [];
  const counts = extractJson(
    wp(env, ["eval", '$o=array(); foreach(get_post_types(array("public"=>true)) as $pt){ if($pt==="attachment") continue; $o[$pt]=(int)wp_count_posts($pt)->publish; } echo json_encode($o);']),
  ) || {};
  const cron = parseInt((wp(env, ["cron", "event", "list", "--format=count"]).match(/\d+/) || [0])[0], 10) || 0;
  const pluginMap = {};
  for (const p of plugins) pluginMap[p.name] = { version: p.version, active: p.status === "active" || p.status === "must-use" };
  // A live WP site always has plugins and post/page counts — an empty capture
  // means a WP-CLI/parse failure, not a clean site. Refuse it (else false-green).
  if (Object.keys(pluginMap).length === 0 || Object.keys(counts).length === 0) {
    throw new Error("data-integrity: capture looks empty (plugins/counts) — likely a WP-CLI/parse failure; refusing to use as baseline/after.");
  }
  return { plugins: pluginMap, counts, cron };
}

function compare(before, after) {
  const hard = [], soft = [];
  for (const [name, b] of Object.entries(before.plugins)) {
    const a = after.plugins[name];
    if (!a) { soft.push(`plugin '${name}' no longer present`); continue; }
    if (cmpVer(a.version, b.version) < 0) hard.push(`plugin '${name}' version moved BACKWARD ${b.version} → ${a.version}`);
    else if (cmpVer(a.version, b.version) > 0) soft.push(`plugin '${name}' updated ${b.version} → ${a.version}`);
    if (b.active && !a.active) hard.push(`plugin '${name}' was active but is now INACTIVE`);
  }
  for (const [pt, b] of Object.entries(before.counts)) {
    const a = after.counts[pt] ?? 0;
    if (a < b) hard.push(`published '${pt}' count DROPPED ${b} → ${a} (possible data loss)`);
    else if (a > b) soft.push(`published '${pt}' count ${b} → ${a}`);
  }
  if (before.cron > 0 && after.cron === 0) hard.push(`cron queue emptied (${before.cron} → 0)`);
  return { hard, soft };
}

function main() {
  const envName = arg("--env", "staging");
  const config = loadConfig();
  const env = getEnv(config, envName);
  const file = path.join(snapshotDir(config), `${envName}.data-integrity.json`);

  if (has("--capture")) {
    fs.mkdirSync(snapshotDir(config), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ env: envName, takenAt: new Date().toISOString(), ...capture(env) }, null, 2) + "\n");
    process.stdout.write(`data-integrity: baseline captured → ${config.snapshotDir}/${envName}.data-integrity.json\n`);
    return;
  }
  if (has("--compare")) {
    if (!fs.existsSync(file)) {
      process.stderr.write(`data-integrity: no baseline at ${file} — run --capture before the update.\n`);
      process.exit(1);
    }
    const before = JSON.parse(fs.readFileSync(file, "utf8"));
    const after = capture(env);
    const { hard, soft } = compare(before, after);
    const hardFail = hard.length > 0;
    if (hardFail) {
      const cleared = clearPassRecords(config, envName);
      if (cleared.length) process.stderr.write(`data-integrity: HARD fail → revoked pass record(s): ${cleared.join(", ")}\n`);
    }
    process.stdout.write(JSON.stringify({ env: envName, hardFail, hard, soft }, null, 2) + "\n");
    process.exit(hardFail ? 1 : 0);
  }
  process.stderr.write("data-integrity: pass --capture or --compare.\n");
  process.exit(1);
}

try {
  main();
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}
