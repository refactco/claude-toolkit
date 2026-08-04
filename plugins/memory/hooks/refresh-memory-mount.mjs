#!/usr/bin/env node
// refresh-memory-mount — SessionStart hook (memory pack).
//
// Keeps the shared refact-memory clone fresh on developer machines: when a
// session starts in a repo with a `memory` mount, staleness-gate a
// `git pull --rebase --autostash` on the clone the symlink points into, and
// warn (never push) when the clone holds local commits origin doesn't have.
// Mirrors the freshness half of the VPS executor's write_and_push() discipline
// (refact-control apps/coding-agent/app/memory_repo.py); the push half lives in
// the pack's writing skills.
//
// Posture: silence is the success mode; every failure path is one line and
// exit 0 — a session must never be blocked because memory couldn't refresh.
//
// Env:
//   REFACT_MEMORY_READONLY            set ⇒ spawned run: exit silently, touch nothing
//   REFACT_MEMORY_PULL_MAX_AGE_HOURS  staleness threshold (default 4)
//   CLAUDE_PROJECT_DIR                the repo the session started in

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PULL_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_AGE_HOURS = 4;

const say = (msg) => process.stdout.write(`${msg}\n`);

function git(cwd, args, timeout = 10_000) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function main() {
  // Spawned/unattended run: its mount is an ephemeral read-only sparse
  // worktree, refreshed by the orchestrator's pre-run pull. Never touch it.
  if (process.env.REFACT_MEMORY_READONLY) return;

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const link = path.join(root, "memory");

  let st;
  try {
    st = fs.lstatSync(link);
  } catch {
    return; // no mount in this repo — perfect no-op
  }
  if (!st.isSymbolicLink()) return; // a real directory is not the mount

  let target;
  try {
    target = fs.realpathSync(link);
  } catch {
    say("memory mount is dangling — run the repo's link script (npm run link-memory)");
    return;
  }

  let clone;
  try {
    clone = git(target, ["rev-parse", "--show-toplevel"]);
  } catch {
    say("refact-memory: mount target is not a git checkout — run the repo's link script");
    return;
  }

  try {
    // A linked worktree (the VPS spawn shape) has its git dir under
    // <clone>/.git/worktrees/ — never pull those either.
    const gitDir = git(clone, ["rev-parse", "--absolute-git-dir"]);
    if (gitDir.includes(`${path.sep}worktrees${path.sep}`)) return;
  } catch {
    return;
  }

  // Staleness gate: skip the network entirely when the clone fetched recently.
  const maxAgeHours = Number(process.env.REFACT_MEMORY_PULL_MAX_AGE_HOURS) || DEFAULT_MAX_AGE_HOURS;
  let stale = true;
  try {
    const fetchHead = fs.statSync(path.join(clone, ".git", "FETCH_HEAD"));
    stale = Date.now() - fetchHead.mtimeMs > maxAgeHours * 3600_000;
  } catch {
    /* no FETCH_HEAD yet — treat as stale */
  }

  if (stale) {
    let before = null;
    try {
      before = git(clone, ["rev-parse", "--short", "HEAD"]);
    } catch {
      /* detached/empty — the pull result message just loses the sha range */
    }
    try {
      git(clone, ["pull", "--rebase", "--autostash"], PULL_TIMEOUT_MS);
      const after = git(clone, ["rev-parse", "--short", "HEAD"]);
      if (before && after !== before) say(`refact-memory: pulled (${before} → ${after})`);
    } catch (err) {
      try {
        git(clone, ["rebase", "--abort"]);
      } catch {
        /* not mid-rebase — nothing to abort */
      }
      const first = String((err && err.stderr) || (err && err.message) || err).split("\n")[0].slice(0, 160);
      say(`refact-memory: pull failed (${first}) — continuing with existing clone`);
    }
  }

  // Unpushed-writes warning — runs even when the pull was skipped. Warn only;
  // pushing is the writing skills' job, never a session-start side effect.
  try {
    const n = Number(git(clone, ["rev-list", "--count", "@{upstream}..HEAD"]));
    if (n > 0) {
      say(
        `refact-memory: ${n} unpushed local commit(s) — push them or they stay invisible to the VPS and other machines`,
      );
    }
  } catch {
    /* unusual branch state — stay quiet rather than noisy */
  }
}

try {
  main();
} catch {
  /* never block a session on a freshness check */
}
process.exit(0);
