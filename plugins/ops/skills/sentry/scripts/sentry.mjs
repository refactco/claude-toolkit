#!/usr/bin/env node
// agent/scripts/sentry.mjs  (generated into .cursor/scripts/ and .claude/scripts/)
//
// Sentry issue triage. Talks to the Sentry API and helps you work a backlog of
// errors/warnings: list + aggregate unresolved issues by source, classify them
// as "ours" (code we maintain) vs "third-party" (vendor deps), drill into a
// single issue's latest-event stack frames + variables to pinpoint a root
// cause, and mute/resolve issues in bulk to reclaim quota.
//
// This is PROCESS, not content: org/project/region and the "ours" path
// patterns are read from .refact-os.json `sentry`, never baked in.
//
// Commands:
//   issues                 List unresolved issues, aggregated by source, with an
//                          ours-vs-third-party split. Sorted by event volume.
//   issue <id|shortId>     Show one issue + its latest event's stack frames and
//                          captured vars (deepest in-app frame highlighted).
//   mute <id...>           Set issues to "ignored" (stops quota burn). event:write.
//   resolve <id...>        Set issues to "resolved". Needs event:write.
//
// Config (.refact-os.json):
//   "sentry": {
//     "org": "my-org-slug",            // required
//     "project": "my-project-slug",    // required for `issues`
//     "host": "https://my-org.sentry.io",   // optional; default https://<org>.sentry.io
//     "ownPaths": ["wp-content/themes/acme", "wp-content/mu-plugins/acme", "apps/web/src"],
//                                       // substrings that mark a culprit as OURS
//     "tokenItem": "MyProjectSentryToken"  // optional 1Password item title override
//   }
//
// Token (never written to disk), resolved in order:
//   1. SENTRY_TOKEN in the environment / .env, else
//   2. the SENTRY_TOKEN field of a shared 1Password item (default title
//      "SENTRY TOKEN", override per-project via sentry.tokenItem) in the
//      "Env Variables & Secrets" vault, read on demand via the op CLI.
//   Create one at: <host>/settings/account/api/auth-tokens/  — scopes:
//   org:read, project:read, event:read (+ event:write for mute/resolve).
//
// Usage:
//   node agent/scripts/sentry.mjs issues
//   node agent/scripts/sentry.mjs issues --env production --period 14d --limit 100
//   node agent/scripts/sentry.mjs issues --json
//   node agent/scripts/sentry.mjs issue PROJECT-123
//   node agent/scripts/sentry.mjs mute 1234567890 1234567891
//   node agent/scripts/sentry.mjs resolve 1234567892

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PROJECT_ROOT = process.cwd();
const ENV_PATH = path.join(PROJECT_ROOT, ".env");
const CONFIG_PATH = path.join(PROJECT_ROOT, ".refact-os.json");
const OP_VAULT = "Env Variables & Secrets";
const DEFAULT_TOKEN_ITEM = "SENTRY TOKEN";
// statsPeriod the issues API accepts. (Sentry rejects 30d/90d here.)
const VALID_PERIODS = ["", "24h", "14d"];

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) || {};
  } catch {
    return {};
  }
}

function opReadField(vault, item, field) {
  const out = execFileSync(
    "op",
    ["item", "get", item, "--vault", vault, "--fields", `label=${field}`, "--reveal", "--format", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(out);
  const fields = Array.isArray(parsed) ? parsed : [parsed];
  const match = fields.find((f) => (f?.value ?? "") !== "");
  return (match?.value ?? "").trim();
}

function opErrorHint(err, item) {
  if (err && err.code === "ENOENT") return "the 1Password CLI (op) is not installed.";
  const msg = String((err && (err.stderr || err.message)) || err);
  if (/sign ?in|signed in|authenticat|OP_SERVICE_ACCOUNT_TOKEN|no account|not currently/i.test(msg)) {
    return "1Password (op) is not authenticated.";
  }
  if (/isn'?t an item|not found|no item matched|more than one item|no object matched/i.test(msg)) {
    return `couldn't read SENTRY_TOKEN from item "${item}" in "${OP_VAULT}" — check the title (set sentry.tokenItem in .refact-os.json if it differs).`;
  }
  return `op error reading "${item}": ${msg.split("\n")[0]}`;
}

function resolveToken(env, config) {
  const literal = (env.SENTRY_TOKEN || "").trim();
  if (literal && !literal.startsWith("op://")) return { token: literal, source: "env" };
  const item = (config.sentry?.tokenItem || DEFAULT_TOKEN_ITEM).trim();
  try {
    const token = opReadField(OP_VAULT, item, "SENTRY_TOKEN");
    if (token) return { token, source: `1Password item "${item}"` };
    return { token: "", error: `the SENTRY_TOKEN field is empty in 1Password item "${item}".` };
  } catch (err) {
    return { token: "", error: opErrorHint(err, item) };
  }
}

function die(message, code = 1) {
  process.stderr.write(`sentry: ${message}\n`);
  process.exit(code);
}

function apiBase(config) {
  const org = (config.sentry?.org || "").trim();
  if (!org) die("set sentry.org in .refact-os.json (your Sentry organization slug).");
  const host = (config.sentry?.host || `https://${org}.sentry.io`).replace(/\/+$/, "");
  return { org, host, base: `${host}/api/0` };
}

async function api(token, url, { method = "GET", body } = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (attempt === 3) die(`network error: ${err.message}`);
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const detail = (data && data.detail) || text || res.statusText;
      if (res.status === 401) die(`401 Unauthorized — token invalid or expired. ${detail}`);
      if (res.status === 403) die(`403 Forbidden — token lacks scope/access. ${detail}`);
      die(`${res.status} from Sentry: ${detail}`);
    }
    return data;
  }
  die("exhausted retries talking to Sentry.");
}

// Extract a coarse "source" label from a culprit/transaction string.
// WP-aware (wp-content/{plugins,themes,mu-plugins}/<name>), with a generic
// fallback to the leading path segments so it degrades for any stack.
function sourceOf(culprit) {
  const c = culprit || "";
  let m = c.match(/\/wp-content\/(plugins|themes|mu-plugins)\/([^/]+)/);
  if (m) return `${m[1]}/${m[2]}`;
  if (/^\/wp-/.test(c) || /wp-includes|wp-admin/.test(c)) return "wp-core";
  m = c.match(/([A-Za-z0-9_@.-]+\/[A-Za-z0-9_@.-]+)/);
  return m ? m[1] : "other";
}

// True only for code we maintain: matches an ownPaths prefix AND is not a
// vendored/bundled dependency living under one of those paths.
function isOwn(filePath, ownPaths) {
  const c = filePath || "";
  if (/\/vendor\/|\/node_modules\//.test(c)) return false;
  return ownPaths.some((p) => c.includes(p));
}

function classify(culprit, ownPaths) {
  if (!ownPaths || ownPaths.length === 0) return "unknown";
  return isOwn(culprit, ownPaths) ? "ours" : "third-party";
}

function num(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--env") args.env = (argv[++i] || "").trim();
    else if (a.startsWith("--env=")) args.env = a.slice(6).trim();
    else if (a === "--period") args.period = (argv[++i] || "").trim();
    else if (a.startsWith("--period=")) args.period = a.slice(9).trim();
    else if (a === "--limit") args.limit = num(argv[++i]);
    else if (a.startsWith("--limit=")) args.limit = num(a.slice(8));
    else if (a === "--query") args.query = (argv[++i] || "").trim();
    else if (a.startsWith("--query=")) args.query = a.slice(8).trim();
    else if (a === "--json") args.json = true;
    else args._.push(a);
  }
  return args;
}

async function cmdIssues(token, config, args) {
  const { org, base } = apiBase(config);
  const project = (config.sentry?.project || "").trim();
  if (!project) die("set sentry.project in .refact-os.json (your Sentry project slug).");
  const ownPaths = config.sentry?.ownPaths || [];
  const period = args.period ?? "14d";
  if (!VALID_PERIODS.includes(period)) die(`--period must be one of: ${VALID_PERIODS.filter(Boolean).join(", ")}`);
  const limit = args.limit || 100;

  const url = new URL(`${base}/projects/${org}/${project}/issues/`);
  url.searchParams.set("query", args.query || "is:unresolved");
  url.searchParams.set("statsPeriod", period);
  url.searchParams.set("sort", "freq");
  url.searchParams.set("limit", String(limit));
  if (args.env) url.searchParams.set("environment", args.env);

  const issues = await api(token, url.toString());
  if (!Array.isArray(issues)) die(`unexpected response: ${JSON.stringify(issues).slice(0, 300)}`);

  const rows = issues.map((i) => {
    const culprit = i.culprit || "";
    return {
      shortId: i.shortId,
      id: i.id,
      events: num(i.count),
      users: i.userCount || 0,
      level: i.level || "",
      lastSeen: (i.lastSeen || "").slice(0, 10),
      title: (i.title || i.metadata?.value || i.metadata?.type || "").slice(0, 80),
      culprit,
      source: sourceOf(culprit),
      bucket: classify(culprit, ownPaths),
    };
  });

  if (args.json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return;
  }

  const totalEvents = rows.reduce((s, r) => s + r.events, 0);
  // Aggregate by source.
  const bySource = new Map();
  for (const r of rows) {
    const e = bySource.get(r.source) || { events: 0, issues: 0, bucket: r.bucket };
    e.events += r.events;
    e.issues += 1;
    bySource.set(r.source, e);
  }
  const sorted = [...bySource.entries()].sort((a, b) => b[1].events - a[1].events);

  const oursEvents = rows.filter((r) => r.bucket === "ours").reduce((s, r) => s + r.events, 0);
  const tpEvents = rows.filter((r) => r.bucket === "third-party").reduce((s, r) => s + r.events, 0);

  process.stdout.write(`\nSentry: ${org}/${project}${args.env ? ` [env:${args.env}]` : ""}  period=${period}\n`);
  process.stdout.write(`Unresolved issues: ${rows.length}   Events: ${totalEvents}\n`);
  if (ownPaths.length) {
    process.stdout.write(`  ours: ${oursEvents} ev  |  third-party: ${tpEvents} ev  |  unclassified: ${totalEvents - oursEvents - tpEvents} ev\n`);
  } else {
    process.stdout.write(`  (set sentry.ownPaths in .refact-os.json to split ours vs third-party)\n`);
  }

  process.stdout.write(`\n=== BY SOURCE (events | issues | bucket) ===\n`);
  for (const [src, e] of sorted) {
    process.stdout.write(`  ${String(e.events).padStart(8)} ev  ${String(e.issues).padStart(3)}  ${e.bucket.padEnd(11)}  ${src}\n`);
  }

  const ours = rows.filter((r) => r.bucket === "ours").sort((a, b) => b.events - a.events);
  if (ours.length) {
    process.stdout.write(`\n=== OURS — code we maintain (fix these) ===\n`);
    for (const r of ours) {
      process.stdout.write(`  #${r.shortId}  ev=${r.events} users=${r.users} ${r.level} last=${r.lastSeen}\n`);
      process.stdout.write(`     ${r.title}\n     ${r.culprit}\n`);
    }
  }
  process.stdout.write(`\nDrill in: node agent/scripts/sentry.mjs issue <shortId>\n`);
}

async function cmdIssue(token, config, args) {
  const { org, base } = apiBase(config);
  const id = args._[0];
  if (!id) die("usage: issue <id|shortId>");
  const issue = await api(token, `${base}/organizations/${org}/issues/${encodeURIComponent(id)}/`);
  process.stdout.write(`\n#${issue.shortId}  ${issue.title}\n`);
  process.stdout.write(`level=${issue.level} events=${num(issue.count)} users=${issue.userCount} first=${(issue.firstSeen || "").slice(0, 10)} last=${(issue.lastSeen || "").slice(0, 10)}\n`);
  process.stdout.write(`culprit: ${issue.culprit || ""}\n`);

  const ev = await api(token, `${base}/organizations/${org}/issues/${issue.id}/events/latest/`);
  const tags = Object.fromEntries((ev.tags || []).map((t) => [t.key, t.value]));
  if (tags.url) process.stdout.write(`url: ${tags.url}\n`);
  if (tags.environment) process.stdout.write(`environment: ${tags.environment}\n`);

  const ownPaths = config.sentry?.ownPaths || [];
  const isOurs = (fn) => isOwn(fn, ownPaths);

  for (const entry of ev.entries || []) {
    if (entry.type !== "exception") continue;
    for (const val of entry.data.values || []) {
      process.stdout.write(`\nEXC ${val.type}: ${String(val.value || "").slice(0, 160)}\n`);
      const frames = (val.stacktrace && val.stacktrace.frames) || [];
      // Sentry orders frames outermost-first; show the innermost 8 (where it fired).
      const tail = frames.slice(-8).reverse();
      for (const f of tail) {
        const fn = f.filename || f.absPath || "";
        const mark = isOurs(fn) ? " <= OURS" : "";
        process.stdout.write(`  ${fn}:${f.lineNo}  ${f.function || ""}${mark}\n`);
        if (f.contextLine) process.stdout.write(`       >> ${f.contextLine.trim().slice(0, 140)}\n`);
      }
      // Surface captured vars from the deepest frame that has them.
      const withVars = [...frames].reverse().find((f) => f.vars && Object.keys(f.vars).length);
      if (withVars) {
        process.stdout.write(`  VARS @ ${withVars.filename}:${withVars.lineNo}\n`);
        process.stdout.write(`  ${JSON.stringify(withVars.vars).slice(0, 700)}\n`);
      }
    }
  }
}

async function cmdSetStatus(token, config, args, status) {
  const { org, base } = apiBase(config);
  const ids = args._;
  if (!ids.length) die(`usage: ${status === "ignored" ? "mute" : "resolve"} <id...>`);
  for (const id of ids) {
    await api(token, `${base}/organizations/${org}/issues/${encodeURIComponent(id)}/`, {
      method: "PUT",
      body: { status },
    });
    process.stdout.write(`  ${id} -> ${status}\n`);
  }
  process.stdout.write(`Done: ${ids.length} issue(s) set to ${status}.\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  const config = loadConfig();
  const env = { ...loadDotEnv(ENV_PATH), ...process.env };

  if (!cmd || ["-h", "--help", "help"].includes(cmd)) {
    process.stdout.write(
      "Sentry triage\n" +
        "  node agent/scripts/sentry.mjs issues [--env <e>] [--period 24h|14d] [--limit N] [--query <q>] [--json]\n" +
        "  node agent/scripts/sentry.mjs issue <id|shortId>\n" +
        "  node agent/scripts/sentry.mjs mute <id...>\n" +
        "  node agent/scripts/sentry.mjs resolve <id...>\n",
    );
    return;
  }

  const { token, source, error } = resolveToken(env, config);
  if (!token) {
    die(
      `SENTRY_TOKEN could not be sourced — ${error || "it is not set."}\n` +
        "  Set SENTRY_TOKEN in .env, or as the SENTRY_TOKEN field of the shared 1Password item.\n" +
        "  Create a token at <host>/settings/account/api/auth-tokens/ (scopes: org:read, project:read, event:read, +event:write to mute/resolve).",
    );
  }
  if (process.env.SENTRY_DEBUG) process.stderr.write(`Resolved SENTRY_TOKEN from ${source}.\n`);

  if (cmd === "issues") return cmdIssues(token, config, args);
  if (cmd === "issue") return cmdIssue(token, config, args);
  if (cmd === "mute") return cmdSetStatus(token, config, args, "ignored");
  if (cmd === "resolve") return cmdSetStatus(token, config, args, "resolved");
  die(`unknown command "${cmd}" — try: issues | issue | mute | resolve`);
}

main().catch((err) => die(err && err.stack ? err.stack : String(err)));
