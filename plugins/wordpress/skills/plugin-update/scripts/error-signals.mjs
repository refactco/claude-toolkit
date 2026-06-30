#!/usr/bin/env node
// HARD QA layer: collect fatal-breakage signals after a plugin update.
//
//   node agent/skills/plugin-update/scripts/error-signals.mjs --env <env> --slug <slug>
//
// Three checks:
//   ① HTTP status of every qa.routes URL  → 5xx or WSOD = HARD fail
//   ② debug.log diff (only lines written AFTER the snapshot marker) for NEW
//      PHP fatals / uncaught errors      → HARD fail. Notices/deprecations/
//      warnings (incl. the pre-existing _load_textdomain_just_in_time noise)
//      are ignored. Handles log rotation (size shrank below the marker).
//   ③ wp plugin verify-checksums <slug>  → reported as a WARNING (premium /
//      modified plugins legitimately fail this), not an automatic hard fail.
//
// On a GREEN run (no hardFail) it writes a pass record into <snapshotDir>:
//   <slug>-<env>.pass.json  { slug, env, version, hardFail:false, takenAt, ... }
// which wp.mjs requires (fresh + version-matched) before allowing a prod
// promotion. On a hard fail it DELETES any existing pass record so a stale pass
// can never authorize a promotion. Exits non-zero when hardFail is true.

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  loadConfig, getEnv, buildSshArgv, shellQuote,
  snapshotDir, passRecordPath, newRunId, REPO_ROOT,
} from "./lib/config.mjs";

const BIG = 16 * 1024 * 1024;
const REPO_ROOT_PREFIX = REPO_ROOT + "/";

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const FATAL_RE = /(PHP Fatal|Fatal error|Uncaught\b|Allowed memory size of \d+ bytes exhausted|maximum execution time|Error establishing a database connection|Error performing (a )?migration|dbDelta\(\) error)/i;
const WSOD_RE = /There has been a critical error on this website/i;

function sshCapture(env, remoteCmd) {
  const { user, host, port } = env.ssh;
  return spawnSync(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20",
      "-p", String(port), `${user}@${host}`, remoteCmd],
    { encoding: "utf8", maxBuffer: BIG },
  );
}

function checkRoutes(env, routes) {
  const base = env.url.replace(/\/$/, "");
  const results = [];
  for (const r of routes) {
    const url = base + (r.path.startsWith("/") ? r.path : "/" + r.path);
    const res = spawnSync(
      "curl",
      ["-sS", "-L", "--max-time", "30", "-A", "plugin-update-qa-check", "-w", "\n__HTTP__%{http_code}", url],
      { encoding: "utf8", maxBuffer: BIG },
    );
    const body = res.stdout || "";
    const m = body.match(/\n__HTTP__(\d{3})\s*$/);
    const status = m ? parseInt(m[1], 10) : 0;
    const html = m ? body.slice(0, m.index) : body;
    const wsod = WSOD_RE.test(html);
    const empty = status === 200 && html.trim().length === 0;
    const fail = status >= 500 || status === 0 || wsod || empty;
    results.push({
      name: r.name, url, status, fail,
      reason: status >= 500 ? `HTTP ${status}` : status === 0 ? "no response / connection error" : wsod ? "WSOD (critical error page)" : empty ? "empty 200 body" : "ok",
    });
  }
  return results;
}

function getDebugLogSize(env) {
  const res = sshCapture(env, `cd ${shellQuote(env.ssh.path + "/wp-content")} && (wc -c < debug.log 2>/dev/null || echo 0)`);
  const n = parseInt((res.stdout || "0").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function tailDebugLog(env, fromBytes) {
  const wpContent = env.ssh.path + "/wp-content";
  const from = Math.max(1, fromBytes);
  const res = sshCapture(env, `cd ${shellQuote(wpContent)} && (tail -c +${from} debug.log 2>/dev/null || true)`);
  return res.stdout || "";
}

function verifyChecksums(env, slug) {
  const { file, args } = buildSshArgv(env, ["plugin", "verify-checksums", slug]);
  const res = spawnSync(file, args, { encoding: "utf8", maxBuffer: BIG });
  return { ok: res.status === 0, output: (res.stdout || res.stderr || "").trim().split("\n").slice(-5).join("\n") };
}

function getInstalledVersion(env, slug) {
  const { file, args } = buildSshArgv(env, ["plugin", "get", slug, "--field=version"]);
  const res = spawnSync(file, args, { encoding: "utf8", maxBuffer: BIG });
  const line = (res.stdout || "").split("\n").map((l) => l.trim()).find((l) => /^v?\d+(?:\.\d+)+/.test(l));
  return line ? line.replace(/^v/, "") : null;
}

function readSnapshotMeta(config, slug, envName) {
  const p = `${snapshotDir(config)}/${slug}-${envName}.json`;
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function main() {
  const envName = arg("--env", "staging");
  const slug = arg("--slug");
  if (!slug) { process.stderr.write("error-signals: --slug is required.\n"); process.exit(1); }

  const config = loadConfig();
  const env = getEnv(config, envName);
  const routes = config.qa?.routes || [];
  const meta = readSnapshotMeta(config, slug, envName);

  const signals = [];
  let hardFail = false;

  // ① HTTP / WSOD
  if (routes.length === 0) {
    signals.push({ layer: "http", severity: "warn", detail: "no qa.routes configured — HTTP layer skipped. Add routes in Setup." });
  } else {
    const routeResults = checkRoutes(env, routes);
    const bad = routeResults.filter((r) => r.fail);
    if (bad.length) {
      hardFail = true;
      for (const b of bad) signals.push({ layer: "http", severity: "fatal", detail: `${b.name} (${b.url}): ${b.reason}` });
    } else {
      signals.push({ layer: "http", severity: "ok", detail: `${routeResults.length} routes returned non-5xx, non-WSOD.` });
    }
  }

  // ② debug.log diff (rotation-aware)
  if (!meta) {
    signals.push({ layer: "debug-log", severity: "warn", detail: "no snapshot marker — cannot diff; run snapshot.mjs before updating. Skipping fatal diff." });
  } else {
    const currentSize = getDebugLogSize(env);
    const rotated = currentSize < (meta.debugLogBytes || 0);
    const fromBytes = rotated ? 1 : (meta.debugLogBytes || 0) + 1;
    const newLines = tailDebugLog(env, fromBytes).split("\n");
    const fatals = newLines.filter((l) => FATAL_RE.test(l));
    const rotNote = rotated ? " (log rotated since snapshot — scanned whole file)" : "";
    if (fatals.length) {
      hardFail = true;
      signals.push({ layer: "debug-log", severity: "fatal", detail: `${fatals.length} NEW fatal/uncaught line(s)${rotNote}:\n  ${fatals.slice(0, 5).join("\n  ")}` });
    } else {
      signals.push({ layer: "debug-log", severity: "ok", detail: `${newLines.filter(Boolean).length} new log line(s)${rotNote}, none fatal.` });
    }
  }

  // ③ checksums (soft)
  const cs = verifyChecksums(env, slug);
  signals.push({
    layer: "checksums",
    severity: cs.ok ? "ok" : "warn",
    detail: cs.ok ? `verify-checksums passed for ${slug}.` : `verify-checksums did NOT pass for ${slug} (common for premium/modified plugins — verify manually):\n  ${cs.output}`,
  });

  // Pass record — the second factor wp.mjs requires before a prod promotion.
  // STAGING ONLY: the promotion gate reads the staging record, so never emit an
  // authorizing record for any other env (defense-in-depth).
  const passPath = passRecordPath(config, slug, envName);
  let wrotePass = false;
  if (envName === "staging") {
    if (hardFail) {
      if (fs.existsSync(passPath)) fs.rmSync(passPath); // a stale pass must not authorize a promotion
    } else {
      const version = getInstalledVersion(env, slug);
      fs.mkdirSync(snapshotDir(config), { recursive: true });
      fs.writeFileSync(passPath, JSON.stringify({
        runId: newRunId(), slug, env: envName, version, hardFail: false,
        note: "Attests the HARD error-signal layer (HTTP, debug.log, checksums) on staging. Functional/interactive + visual layers run separately; fingerprint/data-integrity revoke this record on their own HARD fail.",
        layers: signals, takenAt: new Date().toISOString(),
      }, null, 2) + "\n");
      wrotePass = true;
    }
  }

  const report = { env: envName, slug, hardFail, passRecord: wrotePass ? passPath.replace(REPO_ROOT_PREFIX, "") : null };
  report.signals = signals;
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(hardFail ? 1 : 0);
}

try {
  main();
} catch (e) {
  process.stderr.write(`error-signals: ${e.message}\n`);
  process.exit(1);
}
