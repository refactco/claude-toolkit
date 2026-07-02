#!/usr/bin/env node
// Remove the QA-TEST entries the SOFT real-submit check creates, so test data
// doesn't accumulate in the owner's inbox/CRM. (The admin EMAIL notification a
// submit triggers cannot be un-sent — only stored entries/comments are cleanable.)
//
//   node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/form-cleanup.mjs --env staging              # DRY RUN (lists only)
//   node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/form-cleanup.mjs --env staging --confirm    # actually delete
//   node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/form-cleanup.mjs --env production --confirm --allow-prod-write
//
// Cleans (best-effort, only what's safe + plugin-supported):
//   - WP comments whose content/author contains the QA marker (wp comment delete)
//   - Gravity Forms entries containing the marker, IF the `wp gf` CLI is present
// Plugins without a safe CLI delete (WPForms Lite stores no entries; WPForms Pro
// /Ninja keep them in plugin tables) are REPORTED for manual review — never
// blind-deleted from arbitrary DB tables.
//
// Guards: refuses production without --allow-prod-write (hard rule #3); dry-run
// unless --confirm.

import { spawnSync } from "node:child_process";
import { loadConfig, getEnv, buildSshArgv } from "./lib/config.mjs";

const BIG = 16 * 1024 * 1024;
const MARKER = "QA-TEST";

const has = (f) => process.argv.includes(f);
function arg(flag, def) { const i = process.argv.indexOf(flag); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
function die(m) { process.stderr.write(m.endsWith("\n") ? m : m + "\n"); process.exit(2); }

function wp(env, wpArgs) {
  const { file, args } = buildSshArgv(env, wpArgs);
  const res = spawnSync(file, args, { encoding: "utf8", maxBuffer: BIG, timeout: 30_000 });
  return { ok: res.status === 0, out: (res.stdout || "").trim(), err: (res.stderr || (res.error && res.error.message) || "").trim() };
}

function cleanComments(env, confirm, report) {
  const list = wp(env, ["comment", "list", `--search=${MARKER}`, "--field=ids", "--format=ids"]);
  const ids = (list.out || "").split(/\s+/).filter(Boolean);
  report.comments = { found: ids.length, deleted: 0 };
  if (!ids.length) return;
  if (!confirm) return;
  const del = wp(env, ["comment", "delete", ...ids, "--force"]);
  report.comments.deleted = del.ok ? ids.length : 0;
  if (!del.ok) report.notes.push(`comment delete failed: ${del.err}`);
}

function cleanGravity(env, confirm, report) {
  const probe = wp(env, ["gf", "form", "list", "--format=ids"]);
  if (!probe.ok) { report.notes.push("Gravity: `wp gf` CLI not available — skipped (no auto-clean)."); return; }
  const formIds = (probe.out || "").split(/\s+/).filter(Boolean);
  let found = 0, deleted = 0;
  for (const fid of formIds) {
    const entries = wp(env, ["gf", "entry", "list", fid, "--format=json"]);
    let rows = [];
    try { rows = JSON.parse(entries.out || "[]"); } catch { continue; }
    const marked = rows.filter((e) => JSON.stringify(e).includes(MARKER));
    found += marked.length;
    if (confirm) {
      for (const e of marked) {
        const d = wp(env, ["gf", "entry", "delete", String(e.id)]);
        if (d.ok) deleted++;
      }
    }
  }
  report.gravity = { found, deleted };
}

function main() {
  const envName = arg("--env", "staging");
  const confirm = has("--confirm");
  const allowProd = has("--allow-prod-write");
  const config = loadConfig();
  const env = getEnv(config, envName);

  if (envName === "production" && confirm && !allowProd) {
    die("form-cleanup: REFUSING to delete on production without --allow-prod-write (hard rule #3).");
  }

  const report = { env: envName, mode: confirm ? "delete" : "dry-run", marker: MARKER, notes: [] };
  cleanComments(env, confirm, report);
  cleanGravity(env, confirm, report);
  report.notes.push("WPForms Lite stores no entries (nothing to clean). WPForms Pro / Ninja keep entries in plugin tables — review their admin Entries screen for QA-TEST rows.");
  report.notes.push("Note: the admin email NOTIFICATION each submit sends cannot be un-sent — only stored entries are cleanable.");
  if (!confirm) report.notes.push("DRY RUN — re-run with --confirm to delete.");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

try { main(); } catch (e) { die(`form-cleanup: ${e.message}`); }
