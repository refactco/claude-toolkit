#!/usr/bin/env node
// Run a WP-CLI command on a configured environment over SSH.
//
//   node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/wp.mjs <env> [--allow-prod-write] -- <wp args...>
//
// Examples:
//   wp.mjs staging -- core version
//   wp.mjs staging -- plugin list --update=available --format=json
//   wp.mjs production --allow-prod-write -- plugin update wpforms-lite --version=1.10.2
//
// Three layers of protection:
//   1. excludePlugins — a `plugin install|update|delete|activate|deactivate` of
//      a protected slug (e.g. the custom mu-plugin) is REFUSED on EVERY env.
//   2. prod write-guard — any mutating command on `production` is refused
//      without --allow-prod-write (deny-by-default classification in config.mjs).
//   3. promotion gate — a prod `plugin update|install` is additionally refused
//      unless a FRESH staging pass record (written by error-signals.mjs on a
//      green staging QA) exists for the SAME slug AND the SAME pinned --version.
//      This is the second factor the agent cannot self-issue in one breath
//      (repo hard rule #3).
//
// stdout/stderr are inherited so callers can parse stdout cleanly (WP-CLI
// prints PHP notices to stderr). Exit code mirrors the remote command.

import { spawn } from "node:child_process";
import {
  loadConfig, getEnv, isMutating, buildSshArgv,
  excludedPluginTarget, readPassRecord, PASS_RECORD_MAX_AGE_MS,
} from "./lib/config.mjs";

function die(msg, code = 2) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

function parseArgs(argv) {
  const dashDash = argv.indexOf("--");
  if (dashDash === -1) {
    throw new Error("wp.mjs: missing '--' separator. Usage: wp.mjs <env> [--allow-prod-write] -- <wp args...>");
  }
  const pre = argv.slice(0, dashDash);
  const wpArgs = argv.slice(dashDash + 1);
  const allowProdWrite = pre.includes("--allow-prod-write");
  const envName = pre.find((a) => !a.startsWith("-"));
  if (!envName) throw new Error("wp.mjs: no environment named before '--'.");
  if (wpArgs.length === 0) throw new Error("wp.mjs: no WP-CLI command after '--'.");
  return { envName, wpArgs, allowProdWrite };
}

/** Extract { sub, slug, version } for a `plugin <sub> <slug> [--version=x]` command. */
function parsePluginTarget(wpArgs) {
  const tokens = wpArgs.filter((a) => !a.startsWith("-"));
  if (tokens[0] !== "plugin") return null;
  const versionFlag = wpArgs.find((a) => a.startsWith("--version="));
  return {
    sub: tokens[1],
    slug: tokens[2],
    version: versionFlag ? versionFlag.split("=")[1] : null,
  };
}

function checkPromotionGate(config, wpArgs) {
  const pt = parsePluginTarget(wpArgs);
  if (!pt || (pt.sub !== "update" && pt.sub !== "install")) return; // only plugin promotions are gated
  if (!pt.slug) die(`wp.mjs: production plugin ${pt.sub} needs an explicit slug.`);
  if (!pt.version) {
    die(
      `wp.mjs: REFUSING production plugin ${pt.sub} of '${pt.slug}' without a pinned --version.\n` +
        `  Promotions must pin the EXACT version QA'd on staging (e.g. --version=1.10.2).`,
    );
  }
  const rec = readPassRecord(config, pt.slug, "staging");
  if (!rec) {
    die(
      `wp.mjs: REFUSING prod promotion of '${pt.slug}' — no staging pass record found.\n` +
        `  Run the QA loop on staging first; error-signals.mjs writes the pass record on a green run.`,
    );
  }
  if (rec.hardFail !== false) {
    die(`wp.mjs: REFUSING prod promotion of '${pt.slug}' — staging pass record is not green (hardFail=${rec.hardFail}).`);
  }
  const ageMs = Date.now() - Date.parse(rec.takenAt || 0);
  if (!Number.isFinite(ageMs) || ageMs > PASS_RECORD_MAX_AGE_MS) {
    die(
      `wp.mjs: REFUSING prod promotion of '${pt.slug}' — staging pass record is stale (` +
        `${Math.round(ageMs / 3600000)}h old; max ${PASS_RECORD_MAX_AGE_MS / 3600000}h). Re-run staging QA.`,
    );
  }
  if (rec.version && pt.version !== rec.version) {
    die(
      `wp.mjs: REFUSING prod promotion of '${pt.slug}' — version mismatch.\n` +
        `  Pinning --version=${pt.version} but staging QA passed for version ${rec.version}. Promote the QA'd version.`,
    );
  }
}

async function main() {
  const { envName, wpArgs, allowProdWrite } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const env = getEnv(config, envName);

  // 1. excludePlugins — protected slugs are off-limits on every environment.
  const excluded = excludedPluginTarget(config, wpArgs);
  if (excluded) {
    die(`wp.mjs: REFUSING to ${wpArgs[1]} '${excluded}' — it is in excludePlugins (protected) and must never be touched by this skill.`);
  }

  // 2. prod write-guard.
  if (envName === "production" && isMutating(wpArgs)) {
    if (!allowProdWrite) {
      die(
        `plugin-update: REFUSING mutating command on production without --allow-prod-write.\n` +
          `  command: wp ${wpArgs.join(" ")}\n` +
          `  Per hard rule #3, production writes require explicit human approval. Re-run with\n` +
          `  --allow-prod-write only after QA passed on staging AND a human approved the promotion.`,
      );
    }
    // 3. promotion gate (plugin install/update only).
    checkPromotionGate(config, wpArgs);
  }

  const { file, args } = buildSshArgv(env, wpArgs);
  const child = spawn(file, args, { stdio: "inherit" });
  child.on("error", (e) => die(`plugin-update: failed to spawn ssh: ${e.message}`, 1));
  child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 1));
}

main().catch((e) => die(e.message, 1));
