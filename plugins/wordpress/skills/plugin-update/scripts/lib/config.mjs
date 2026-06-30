#!/usr/bin/env node
// Shared config loader + WP-CLI/SSH invocation builder for the plugin-update skill.
//
// Resolves the project config from (in order):
//   1. <repo-root>/plugin-update.config.json   (canonical)
//   2. <repo-root>/.claude/plugin-update.json   (fallback — the original brief's path)
//
// Repo root is resolved relative to THIS file (5 levels up from scripts/lib/),
// so it works whether run from the canonical agent/ copy or a generated
// .cursor/ / .claude/ mirror — same shape, same root.
//
// This module is imported by wp.mjs, check-updates.mjs, snapshot.mjs,
// rollback.mjs, and error-signals.mjs. It does no I/O on import beyond locating
// the repo root; call loadConfig() to read + validate.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(scriptDir, "../../../../..");

const CONFIG_CANDIDATES = [
  path.join(REPO_ROOT, "plugin-update.config.json"),
  path.join(REPO_ROOT, ".claude", "plugin-update.json"),
];

/** Locate the config file. Returns the absolute path or null. */
export function findConfigPath() {
  for (const p of CONFIG_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Load + validate the config. Throws with an actionable message on failure. */
export function loadConfig() {
  const configPath = findConfigPath();
  if (!configPath) {
    throw new Error(
      `plugin-update: no config found. Looked for:\n  ${CONFIG_CANDIDATES.join(
        "\n  ",
      )}\nRun the skill in Setup mode first (Step S1) to create it.`,
    );
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    throw new Error(`plugin-update: config at ${configPath} is not valid JSON: ${e.message}`);
  }

  // Minimal structural validation (the JSON Schema documents the full shape;
  // this guards the fields the scripts actually dereference).
  const errors = [];
  if (!raw.mode) errors.push("missing 'mode'");
  if (!raw.hosting) errors.push("missing 'hosting'");
  if (!raw.environments || typeof raw.environments !== "object") {
    errors.push("missing 'environments'");
  } else {
    for (const [name, env] of Object.entries(raw.environments)) {
      if (!env || typeof env !== "object") {
        errors.push(`environment '${name}' is not an object`);
        continue;
      }
      if (!env.url) errors.push(`environment '${name}' missing 'url'`);
      const s = env.ssh || {};
      for (const f of ["user", "host", "port", "path"]) {
        if (s[f] === undefined || s[f] === null || s[f] === "") {
          errors.push(`environment '${name}' missing ssh.${f}`);
        }
      }
    }
  }
  if (errors.length) {
    throw new Error(`plugin-update: config at ${configPath} is invalid:\n  - ${errors.join("\n  - ")}`);
  }

  // Defaults.
  raw.excludePlugins = raw.excludePlugins || [];
  raw.snapshotDir = raw.snapshotDir || ".plugin-update-snapshots";
  raw.cache = raw.cache || { kinsta: true, cloudflare: true };
  raw.qa = raw.qa || {};
  raw.__path = configPath;
  return raw;
}

/** Return the named environment block or throw. */
export function getEnv(config, name) {
  const env = config.environments?.[name];
  if (!env) {
    throw new Error(
      `plugin-update: environment '${name}' is not configured. Available: ${Object.keys(
        config.environments || {},
      ).join(", ") || "(none)"}`,
    );
  }
  return env;
}

// --- WP-CLI mutation classification (for the production write-guard) -------
//
// DENY-BY-DEFAULT: a command is mutating UNLESS it is positively on the
// read-only allow-list below. This is the only safe direction — an allow-by-
// verb model lets any un-enumerated command (e.g. `core update-db`, which runs
// DB schema migrations) slip through as "read-only". Every command/subcommand
// not listed here is treated as a write and requires --allow-prod-write on the
// production environment.
//
// `cache flush` and `kinsta-cache purge` are operationally non-destructive
// cache busts the QA flow runs against prod after a promotion — they're on the
// allow-list BY INTENT (commented), not by gap.
const READONLY = {
  core: new Set(["version", "check-update"]),
  plugin: new Set(["list", "get", "status", "is-installed", "is-active", "search"]),
  theme: new Set(["list", "get", "status", "is-installed", "is-active", "search"]),
  db: new Set(["export", "size", "tables", "check", "columns", "search"]),
  option: new Set(["get", "list"]),
  post: new Set(["list", "get", "exists", "url"]),
  user: new Set(["list", "get", "exists"]),
  term: new Set(["list", "get"]),
  comment: new Set(["list", "get", "exists", "count"]),
  config: new Set(["get", "list", "has"]),
  transient: new Set(["get"]),
  language: new Set(["list"]),
  cron: new Set(["event list", "schedule list"]),
  cache: new Set(["flush"]), // operationally safe cache bust — prod-allowed by intent
  "kinsta-cache": new Set(["purge"]), // Kinsta cache purge — prod-allowed by intent
};

/** Positively read-only per the allow-list? (deny-by-default) */
export function isReadOnly(wpArgs) {
  const tokens = wpArgs.filter((a) => !a.startsWith("-"));
  const command = tokens[0];
  const sub = tokens[1];
  if (!command) return false;
  const allowed = READONLY[command];
  if (!allowed) return false;
  // Every read-only command here is gated by an explicit subcommand.
  if (sub && allowed.has(sub)) return true;
  if (sub && tokens[2] && allowed.has(`${sub} ${tokens[2]}`)) return true; // two-word subs (cron event list)
  return false;
}

/** Inverse of isReadOnly — anything not positively read-only is mutating. */
export function isMutating(wpArgs) {
  return !isReadOnly(wpArgs);
}

// Plugin write subcommands whose target slug must be checked against excludePlugins.
const PLUGIN_WRITE_SUBS = new Set([
  "install", "update", "delete", "activate", "deactivate", "uninstall", "toggle",
]);

/**
 * If the command writes a plugin whose slug is in config.excludePlugins, return
 * that slug; otherwise null. Used to HARD-REFUSE touching protected plugins
 * (e.g. the custom mu-plugin) on EVERY environment, not just at listing time.
 */
export function excludedPluginTarget(config, wpArgs) {
  const tokens = wpArgs.filter((a) => !a.startsWith("-"));
  if (tokens[0] !== "plugin" || !PLUGIN_WRITE_SUBS.has(tokens[1])) return null;
  const excluded = new Set(config.excludePlugins || []);
  for (const slug of tokens.slice(2)) {
    if (excluded.has(slug)) return slug;
  }
  return null;
}

/** POSIX single-quote a string for safe interpolation into the remote shell command. */
export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

// --- Snapshot + staging-pass records (paths) -------------------------------

import fsNode from "node:fs";

/** Absolute snapshot directory (created lazily by callers). */
export function snapshotDir(config) {
  return path.join(REPO_ROOT, config.snapshotDir || ".plugin-update-snapshots");
}

/** Where error-signals writes its positive "staging QA passed" record for a slug. */
export function passRecordPath(config, slug, envName) {
  return path.join(snapshotDir(config), `${slug}-${envName}.pass.json`);
}

/** Read a pass record, or null if absent/invalid. */
export function readPassRecord(config, slug, envName) {
  const p = passRecordPath(config, slug, envName);
  if (!fsNode.existsSync(p)) return null;
  try {
    return JSON.parse(fsNode.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Revoke ALL pass records for an env (delete every `*-<env>.pass.json`).
 * Any HARD-layer failure (error-signals, fingerprint, data-integrity) calls this
 * so a structural/data regression can never leave a promotion authorized.
 * Returns the filenames cleared.
 */
export function clearPassRecords(config, envName) {
  const dir = snapshotDir(config);
  if (!fsNode.existsSync(dir)) return [];
  const cleared = [];
  for (const f of fsNode.readdirSync(dir)) {
    if (f.endsWith(`-${envName}.pass.json`)) {
      fsNode.rmSync(path.join(dir, f));
      cleared.push(f);
    }
  }
  return cleared;
}

/** A run identifier. Date/Math are available here (plain node runtime). */
export function newRunId() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.floor(Math.random() * 1e6)}`;
}

/** Max age (ms) a staging pass record may be to authorize a prod promotion. */
export const PASS_RECORD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Build the local `ssh` argv that runs `wp <wpArgs>` in the env's WordPress root.
 * Returns { file: 'ssh', args: [...] } for child_process.spawn (no local shell).
 */
export function buildSshArgv(env, wpArgs, { extraSshOpts = [] } = {}) {
  const { user, host, port, path: docRoot } = env.ssh;
  const remoteWp = ["cd", shellQuote(docRoot), "&&", "wp", ...wpArgs.map(shellQuote)].join(" ");
  return {
    file: "ssh",
    args: [
      "-o", "BatchMode=yes",
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "ConnectTimeout=20",
      "-p", String(port),
      ...extraSshOpts,
      `${user}@${host}`,
      remoteWp,
    ],
  };
}
