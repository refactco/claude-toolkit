#!/usr/bin/env node
// plugin-plan.mjs — READ-ONLY. Reports, for a marketplace (default "refact-os"),
// which packs are installed, which have a newer version available, and which are
// not installed. It runs `claude plugin list` for the installed set and reads the
// cached marketplace manifest for the available versions. It changes nothing; the
// manage-plugins skill runs the actual install/update commands.
//
//   node ${CLAUDE_PLUGIN_ROOT}/skills/manage-plugins/scripts/plugin-plan.mjs [--summary] [--marketplace <name>] [pack ...]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const flagVal = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const MKT = flagVal("--marketplace", "refact-os");
const SUMMARY = args.includes("--summary");
const only = args.filter((a) => !a.startsWith("--") && a !== MKT);

const cmp = (a, b) => {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
};

// --- installed: from `claude plugin list --available --json` -> .installed ------
let installed = [];
try {
  const listed = JSON.parse(execFileSync("claude", ["plugin", "list", "--available", "--json"], { encoding: "utf8" }));
  const suffix = "@" + MKT;
  installed = (listed.installed || [])
    .filter((x) => typeof x?.id === "string" && x.id.endsWith(suffix))
    .map((x) => ({ name: x.id.slice(0, -suffix.length), version: x.version, scope: x.scope, enabled: x.enabled !== false }));
} catch (e) {
  process.stderr.write(`plugin-plan: could not read installed plugins via 'claude plugin list': ${e.message}\n`);
  process.exit(1);
}

// --- available: from the cached marketplace manifest ---------------------------
let avail = {};
try {
  const kmPath = path.join(os.homedir(), ".claude", "plugins", "known_marketplaces.json");
  let loc;
  try { loc = JSON.parse(readFileSync(kmPath, "utf8"))[MKT]?.installLocation; } catch { /* fall through */ }
  loc = loc || path.join(os.homedir(), ".claude", "plugins", "marketplaces", MKT);
  const cat = JSON.parse(readFileSync(path.join(loc, ".claude-plugin", "marketplace.json"), "utf8"));
  for (const p of cat.plugins || []) avail[p.name] = p.version;
} catch (e) {
  process.stderr.write(`plugin-plan: could not read the '${MKT}' catalog (run 'claude plugin marketplace update ${MKT}' first): ${e.message}\n`);
}

const instMap = Object.fromEntries(installed.map((i) => [i.name, i]));
const pick = (names) => (only.length ? names.filter((n) => only.includes(n)) : names);

const toUpdate = pick(installed.map((i) => i.name))
  .filter((n) => avail[n] && cmp(instMap[n].version, avail[n]) < 0)
  .map((n) => ({ name: n, from: instMap[n].version, to: avail[n] }));
const missing = pick(Object.keys(avail)).filter((n) => !instMap[n]).map((n) => ({ name: n, version: avail[n] }));
const upToDate = pick(installed.map((i) => i.name)).filter((n) => avail[n] && cmp(instMap[n].version, avail[n]) === 0);

const report = {
  marketplace: MKT,
  installed,
  available: Object.entries(avail).map(([name, version]) => ({ name, version })),
  toUpdate, missing, upToDate,
};

if (SUMMARY) {
  const L = (s = "") => process.stdout.write(s + "\n");
  L(`marketplace: ${MKT}`);
  L(`installed (${installed.length}): ${installed.map((i) => `${i.name}@${i.version}${i.enabled ? "" : " [disabled]"}`).join(", ") || "none"}`);
  L(`available (${report.available.length}): ${report.available.map((a) => `${a.name}@${a.version}`).join(", ") || "none (update the catalog)"}`);
  L(`TO UPDATE (${toUpdate.length}): ${toUpdate.map((u) => `${u.name} ${u.from}→${u.to}`).join(", ") || "none"}`);
  L(`NOT INSTALLED (${missing.length}): ${missing.map((m) => `${m.name}@${m.version}`).join(", ") || "none"}`);
  L(`up to date (${upToDate.length}): ${upToDate.join(", ") || "none"}`);
} else {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
