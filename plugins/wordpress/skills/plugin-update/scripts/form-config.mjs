#!/usr/bin/env node
// Read each form's WP-CONFIGURED confirmation (the exact success message/redirect
// the site owner set) over SSH/WP-CLI — so the submit check can assert the real
// confirmation deterministically instead of guessing a generic "success" shape.
//
//   node agent/skills/plugin-update/scripts/form-config.mjs --env staging
//
// Covers the plugins whose config is readable server-side:
//   - WPForms : forms are a `wpforms` CPT; post_content is JSON with
//               settings.confirmations[].{type,message}.
//   - Gravity : via `wp gf form list/get` IF the Gravity CLI is present.
// Plugins with no server-readable confirmation (CF7 inline, Ninja) are reported
// as such — the submit check falls back to generic success-shape detection.
//
// Read-only. Prints JSON to stdout: { env, forms: [{ plugin, id, title, confirmations:[{type,message}] }], notes:[] }

import { spawnSync } from "node:child_process";
import { loadConfig, getEnv, buildSshArgv } from "./lib/config.mjs";

const BIG = 16 * 1024 * 1024;

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function wp(env, wpArgs) {
  const { file, args } = buildSshArgv(env, wpArgs);
  const res = spawnSync(file, args, { encoding: "utf8", maxBuffer: BIG, timeout: 30_000 });
  // On timeout/spawn failure, res.status is null and res.error is set — treat as
  // not-ok so callers fall back to generic detection rather than hang the run.
  return { ok: res.status === 0, out: (res.stdout || "").trim(), err: (res.stderr || (res.error && res.error.message) || "").trim() };
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function wpformsConfirmations(env, notes) {
  const list = wp(env, ["post", "list", "--post_type=wpforms", "--field=ids", "--format=ids"]);
  if (!list.ok || !list.out) { notes.push("WPForms: no `wpforms` CPT forms found (plugin inactive or no forms)."); return []; }
  const ids = list.out.split(/\s+/).filter(Boolean);
  const forms = [];
  for (const id of ids) {
    const title = wp(env, ["post", "get", id, "--field=post_title"]);
    const content = wp(env, ["post", "get", id, "--field=post_content"]);
    let confirmations = [];
    try {
      const cfg = JSON.parse(content.out);
      const c = cfg?.settings?.confirmations || {};
      confirmations = Object.values(c).map((x) => ({
        type: x.type || "message",
        message: x.type === "message" || !x.type ? stripTags(x.message) : (x.page || x.redirect || ""),
      }));
    } catch { notes.push(`WPForms form ${id}: post_content was not parseable JSON.`); }
    forms.push({ plugin: "wpforms", id, title: (title.out || "").trim(), confirmations });
  }
  return forms;
}

function gravityConfirmations(env, notes) {
  const probe = wp(env, ["gf", "form", "list", "--format=ids"]);
  if (!probe.ok) { notes.push("Gravity: `wp gf` CLI not available — confirmations not read (submit check uses generic detection)."); return []; }
  const ids = (probe.out || "").split(/\s+/).filter(Boolean);
  const forms = [];
  for (const id of ids) {
    const get = wp(env, ["gf", "form", "get", id, "--format=json"]);
    let confirmations = [];
    let title = "";
    try {
      const f = JSON.parse(get.out);
      title = f?.title || "";
      confirmations = Object.values(f?.confirmations || {}).map((x) => ({
        type: x.type || "message",
        message: x.type === "message" ? stripTags(x.message) : (x.url || x.pageId || ""),
      }));
    } catch { notes.push(`Gravity form ${id}: could not parse.`); }
    forms.push({ plugin: "gravity", id, title, confirmations });
  }
  return forms;
}

function main() {
  const envName = arg("--env", "staging");
  const config = loadConfig();
  const env = getEnv(config, envName);
  const notes = [];
  const forms = [...wpformsConfirmations(env, notes), ...gravityConfirmations(env, notes)];
  notes.push("CF7/Ninja: confirmation is not server-readable → submit check uses generic success-shape detection.");
  process.stdout.write(JSON.stringify({ env: envName, forms, notes }, null, 2) + "\n");
}

try { main(); } catch (e) { process.stderr.write(`form-config: ${e.message}\n`); process.exit(1); }
