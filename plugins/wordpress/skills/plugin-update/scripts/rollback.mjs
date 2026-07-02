#!/usr/bin/env node
// Roll a plugin back to its pre-update version (version-pin reinstall), with an
// optional DB restore from the snapshot.
//
//   node agent/skills/plugin-update/scripts/rollback.mjs --env <env> --slug <slug> [--to <old-version>] [--restore-db --confirm-restore] [--allow-prod-write]
//
// Primary mechanism: `wp plugin install <slug> --version=<old> --force`. If
// --to is omitted, reads the version recorded by snapshot.mjs (and refuses if
// that snapshot is for a different env or is missing).
//
// --restore-db additionally imports the snapshot's DB dump (for migrations).
// It reverts ALL DB changes since the snapshot, so it requires --confirm-restore
// and prints the dump's version/age/size first. Use deliberately.
//
// Guards: refuses excluded (protected) plugins on any env; refuses production
// writes without --allow-prod-write; refuses a 0-byte/mismatched-env dump.

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { loadConfig, getEnv, buildSshArgv, snapshotDir, REPO_ROOT } from "./lib/config.mjs";

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const has = (flag) => process.argv.includes(flag);

function die(msg, code = 1) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

function readSnapshotMeta(config, slug, envName) {
  const p = path.join(snapshotDir(config), `${slug}-${envName}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function importDb(env, sqlPath) {
  if (fs.statSync(sqlPath).size === 0) {
    return Promise.reject(new Error(`rollback: refusing to import a 0-byte dump (${sqlPath}).`));
  }
  const { file, args } = buildSshArgv(env, ["db", "import", "-"]);
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ["pipe", "inherit", "inherit"] });
    child.on("error", reject);
    const input = fs.createReadStream(sqlPath);
    input.on("error", reject);
    child.stdin.on("error", reject);
    input.pipe(child.stdin);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`wp db import exited ${code}`))));
  });
}

async function main() {
  const envName = arg("--env", "staging");
  const slug = arg("--slug");
  if (!slug) die("rollback: --slug is required.");

  const config = loadConfig();

  // Protected plugins are never touched, even to roll back.
  if ((config.excludePlugins || []).includes(slug)) {
    die(`rollback: REFUSING — '${slug}' is in excludePlugins (protected) and must never be reinstalled/downgraded by this skill.`);
  }
  const allowProdWrite = has("--allow-prod-write");
  if (envName === "production" && !allowProdWrite) {
    die("rollback: REFUSING to write to production without --allow-prod-write (hard rule #3).", 2);
  }

  const env = getEnv(config, envName);
  const meta = readSnapshotMeta(config, slug, envName);
  if (meta && meta.env && meta.env !== envName) {
    die(`rollback: snapshot env mismatch — meta is for '${meta.env}' but rollback target is '${envName}'. Refusing to use a cross-env snapshot.`);
  }
  const to = arg("--to") || meta?.version;
  if (!to) {
    die("rollback: no target version. Pass --to <version>, or run snapshot.mjs first so the prior version is on record.");
  }
  if (meta?.takenAt) {
    const ageH = Math.round((Date.now() - Date.parse(meta.takenAt)) / 3600000);
    process.stderr.write(`rollback: using snapshot ${meta.runId || "(no runId)"} taken ${ageH}h ago (recorded version ${meta.version}).\n`);
  }

  process.stderr.write(`rollback: reinstalling ${slug} @ ${to} on ${envName} (--force) …\n`);
  const { file, args } = buildSshArgv(env, ["plugin", "install", slug, `--version=${to}`, "--force"]);
  const res = spawnSync(file, args, { stdio: "inherit" });
  if (res.status !== 0) {
    die(
      `rollback: version-pin reinstall failed (exit ${res.status}).\n` +
        `  This plugin may be premium / not in the WordPress.org directory, so install-by-version isn't available.\n` +
        `  Restore its directory from the host backup, or (if the update ran a migration) restore the DB snapshot:\n` +
        `    node \${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/rollback.mjs --env ${envName} --slug ${slug} --to ${to} --restore-db --confirm-restore`,
      res.status || 1,
    );
  }

  if (has("--restore-db")) {
    if (!has("--confirm-restore")) {
      die(
        `rollback: --restore-db reverts ALL DB changes since the snapshot. Re-run with --confirm-restore to proceed.\n` +
          `  snapshot: ${meta?.dump || "(none on record)"} · version ${meta?.version} · ${meta?.dumpBytes ?? "?"} bytes`,
      );
    }
    if (!meta?.dump) die("rollback: --restore-db requested but no snapshot dump on record. Aborting DB restore.");
    const sqlPath = path.join(REPO_ROOT, meta.dump);
    if (!fs.existsSync(sqlPath)) die(`rollback: snapshot dump missing at ${meta.dump}. Aborting DB restore.`);
    process.stderr.write(`rollback: restoring DB from ${meta.dump} (${meta.dumpBytes} bytes) …\n`);
    await importDb(env, sqlPath);
    process.stdout.write(`rollback: ${slug} restored to ${to} on ${envName}, DB restored from snapshot.\n`);
    return;
  }

  process.stdout.write(`rollback: ${slug} restored to ${to} on ${envName} (version-pin only; DB not touched).\n`);
}

main().catch((e) => {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
});
