#!/usr/bin/env node
// Deterministic status scan for the project-status skill.
//
// Reads through the `memory/` mount (the refact-memory subtree linked by the
// repo's link script): unprocessed evidence, open decisions, recent
// learnings, role placeholders — the mechanical facts the model must NOT
// eyeball-count. The skill body runs this and adds interpretation on top.
//
// Run from the repo root — the mount is resolved as ./memory relative to the
// working directory (override with --root <path>).
//
//   node ${CLAUDE_PLUGIN_ROOT}/skills/project-status/scripts/scan-status.mjs          # text snapshot
//   node ${CLAUDE_PLUGIN_ROOT}/skills/project-status/scripts/scan-status.mjs --json   # machine-readable

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const root = rootFlag >= 0 && args[rootFlag + 1] ? path.resolve(args[rootFlag + 1]) : process.cwd();
const memory = path.join(root, "memory");
const asJson = args.includes("--json");

if (!fs.existsSync(memory)) {
  const msg =
    "memory/ mount not found — run the repo's link script first (`npm run link-memory` or `node scripts/link-memory.mjs`; it clones refact-memory and links the project subtree).";
  if (asJson) process.stdout.write(`${JSON.stringify({ error: msg })}\n`);
  else process.stdout.write(`${msg}\n`);
  process.exit(1);
}

function read(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.name.endsWith(".md")) acc.push(full);
  }
  return acc;
}

// 1. Unprocessed evidence: files whose envelope carries `processed: false`
// (stamped by ingest-input; process-docs flips it after integrating).
const unprocessed = {};
const unprocessedFiles = [];
for (const file of walk(path.join(memory, "evidence"))) {
  const head = (read(file) || "").slice(0, 800);
  if (/^processed:\s*false\s*$/m.test(head)) {
    const label = path.basename(path.dirname(file));
    unprocessed[label] = (unprocessed[label] || 0) + 1;
    unprocessedFiles.push(path.relative(root, file));
  }
}
const unprocessedTotal = unprocessedFiles.length;

// 2. Open decisions: dated bullet entries in memory/knowledge/open-decisions.md.
const openDecRaw = read(path.join(memory, "knowledge", "open-decisions.md"));
const openDecisions = [];
if (openDecRaw != null) {
  for (const line of openDecRaw.split("\n")) {
    const m = line.match(/^-\s+(\d{4}-\d{2}-\d{2}\b.*)$/);
    if (m) openDecisions.push(m[1].trim());
  }
}

// 3. Recent learnings: newest 3 bullets in memory/knowledge/learnings.md.
const learnRaw = read(path.join(memory, "knowledge", "learnings.md"));
const learnings = [];
if (learnRaw != null) {
  const idx = learnRaw.indexOf("## Entries");
  const body = idx >= 0 ? learnRaw.slice(idx) : learnRaw;
  for (const line of body.split("\n")) {
    const m = line.match(/^-\s+(.+)$/);
    if (m) {
      learnings.push(m[1].trim());
      if (learnings.length >= 3) break;
    }
  }
}

// 4. Recent tracker entries: newest 5 by filename date (filenames sort chronologically).
const trackerFiles = walk(path.join(memory, "tracker"))
  .map((f) => path.basename(f))
  .sort()
  .slice(-5)
  .reverse();

// 5. Role placeholders: unfilled <TODO> markers in memory/knowledge/people.md.
const peopleRaw = read(path.join(memory, "knowledge", "people.md"));
const rolePlaceholders = peopleRaw == null ? null : (peopleRaw.match(/<TODO>/g) || []).length;

const missing = [
  openDecRaw == null && "memory/knowledge/open-decisions.md",
  learnRaw == null && "memory/knowledge/learnings.md",
  peopleRaw == null && "memory/knowledge/people.md",
].filter(Boolean);

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      {
        unprocessed: { total: unprocessedTotal, byFolder: unprocessed, files: unprocessedFiles },
        openDecisions: openDecRaw == null ? null : openDecisions,
        recentLearnings: learnRaw == null ? null : learnings,
        recentTracker: trackerFiles,
        rolePlaceholders,
        missing,
      },
      null,
      2,
    )}\n`,
  );
} else {
  const lines = [];
  if (unprocessedTotal === 0) {
    lines.push("Unprocessed evidence: none.");
  } else {
    const parts = Object.entries(unprocessed).map(([k, v]) => `${v} ${k}`);
    lines.push(`Unprocessed evidence: ${parts.join(", ")} (${unprocessedTotal} total).`);
  }

  if (openDecRaw == null) {
    lines.push("Open decisions: (memory/knowledge/open-decisions.md not present).");
  } else if (openDecisions.length === 0) {
    lines.push("Open decisions: none.");
  } else {
    lines.push(`Open decisions: ${openDecisions.length}.`);
    for (const d of openDecisions) lines.push(`  - ${d}`);
  }

  if (learnRaw == null) {
    lines.push("Recent learnings: (memory/knowledge/learnings.md not present).");
  } else if (learnings.length === 0) {
    lines.push("Recent learnings: none yet.");
  } else {
    lines.push("Recent learnings:");
    for (const l of learnings) lines.push(`  - ${l}`);
  }

  if (trackerFiles.length > 0) {
    lines.push("Recent tracker entries:");
    for (const t of trackerFiles) lines.push(`  - ${t}`);
  }

  if (peopleRaw == null) {
    lines.push("Roles: (memory/knowledge/people.md not present).");
  } else if (rolePlaceholders > 0) {
    lines.push(`Roles: ${rolePlaceholders} <TODO> placeholder(s) in people.md.`);
  } else {
    lines.push("Roles: all filled.");
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}
