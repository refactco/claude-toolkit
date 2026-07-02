#!/usr/bin/env node
// Take a pre-update snapshot of an environment, so QA can diff against it and a
// rollback has a fallback beyond the version-pin.
//
//   node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/snapshot.mjs --env <staging|production> --slug <slug>
//
// Captures, into <snapshotDir>/:
//   - <slug>-<env>.sql           : `wp db export` (streamed; the DB safety net)
//   - <slug>-<env>.json          : metadata { runId, version, debugLogBytes, takenAt, dump }
//
// The debugLogBytes marker lets error-signals.mjs read only log lines written
// AFTER the snapshot. The runId + version let rollback.mjs detect a stale snapshot.
// A 0-byte/partial DB export is a HARD ERROR (non-zero exit) so the cycle blocks
// before updating — a bad snapshot is worse than no snapshot.

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { loadConfig, getEnv, buildSshArgv, shellQuote, snapshotDir, newRunId, REPO_ROOT } from "./lib/config.mjs";

const BIG = 16 * 1024 * 1024;

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function sshCapture(env, remoteCmd) {
  const { user, host, port } = env.ssh;
  return spawnSync(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20",
      "-p", String(port), `${user}@${host}`, remoteCmd],
    { encoding: "utf8", maxBuffer: BIG },
  );
}

function ensureSnapshotDir(config) {
  const dir = snapshotDir(config);
  fs.mkdirSync(dir, { recursive: true });
  // Written unconditionally every run so a pre-existing dir can't ship dumps to git.
  fs.writeFileSync(path.join(dir, ".gitignore"), "*\n!.gitignore\n");
  return dir;
}

function getInstalledVersion(env, slug) {
  const { file, args } = buildSshArgv(env, ["plugin", "get", slug, "--field=version"]);
  const res = spawnSync(file, args, { encoding: "utf8", maxBuffer: BIG });
  // Take the FIRST strict version line (a trailing numeric notice must not win).
  const line = (res.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^v?\d+(?:\.\d+)+/.test(l));
  return line ? line.replace(/^v/, "") : null;
}

function getDebugLogBytes(env) {
  const res = sshCapture(
    env,
    `cd ${shellQuote(env.ssh.path + "/wp-content")} && (wc -c < debug.log 2>/dev/null || echo 0)`,
  );
  const n = parseInt((res.stdout || "0").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

async function exportDb(env, destPath) {
  const { file, args } = buildSshArgv(env, ["db", "export", "-", "--single-transaction"]);
  const child = spawn(file, args, { stdio: ["ignore", "pipe", "inherit"] });
  const out = fs.createWriteStream(destPath);
  // pipeline resolves only once the write stream has fully flushed + closed.
  const piped = pipeline(child.stdout, out);
  const exited = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`wp db export exited ${code}`))));
  });
  await Promise.all([piped, exited]);
}

function validateDump(destPath) {
  const size = fs.statSync(destPath).size;
  if (size === 0) throw new Error(`snapshot: DB export is 0 bytes — refusing to proceed (no usable rollback safety net).`);
  // Soft completeness check: mysqldump appends a "-- Dump completed" trailer.
  const fd = fs.openSync(destPath, "r");
  const len = Math.min(512, size);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  const complete = /Dump completed/i.test(buf.toString("utf8"));
  return { size, complete };
}

async function main() {
  const envName = arg("--env", "staging");
  const slug = arg("--slug");
  if (!slug) {
    process.stderr.write("snapshot: --slug is required.\n");
    process.exit(1);
  }
  const config = loadConfig();
  const env = getEnv(config, envName);
  const dir = ensureSnapshotDir(config);

  const version = getInstalledVersion(env, slug);
  const debugLogBytes = getDebugLogBytes(env);
  const dumpPath = path.join(dir, `${slug}-${envName}.sql`);

  process.stderr.write(`snapshot: exporting ${envName} DB to ${path.relative(REPO_ROOT, dumpPath)} …\n`);
  await exportDb(env, dumpPath);
  const { size, complete } = validateDump(dumpPath);
  if (!complete) {
    process.stderr.write(`snapshot: WARNING — dump has no "Dump completed" trailer (${size} bytes). It may be truncated; verify before relying on --restore-db.\n`);
  }

  const meta = {
    runId: newRunId(),
    slug,
    env: envName,
    version,
    debugLogBytes,
    dump: path.relative(REPO_ROOT, dumpPath),
    dumpBytes: size,
    dumpComplete: complete,
    takenAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, `${slug}-${envName}.json`), JSON.stringify(meta, null, 2) + "\n");

  process.stdout.write(JSON.stringify(meta, null, 2) + "\n");
  if (!version) {
    process.stderr.write(`snapshot: WARNING — could not read installed version for '${slug}'. Rollback will need an explicit --to.\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
});
