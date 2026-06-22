#!/usr/bin/env node
// Deterministic status scan for the project-status skill (`/refact status`).
//
// Counts unprocessed docs, open decisions, and role placeholders, and lists the
// most recent learnings — the mechanical facts the model must NOT eyeball-count
// (see the standard's "Latent vs. Deterministic Work"). The skill body runs this
// and adds interpretation on top; it does not re-derive these numbers by hand.
//
//   node agent/skills/project-status/scripts/scan-status.mjs          # text snapshot
//   node agent/skills/project-status/scripts/scan-status.mjs --json   # machine-readable
//
// Paths resolve relative to this file, so it works whether it's run from the
// canonical agent/ copy or a generated .cursor/ / .claude/ mirror. Repo-structure
// health (adapter drift, skill frontmatter) is `refact-os validate`'s job, not
// this script's — this reports project *context* state only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../../../..");
const docs = path.join(root, "docs");
const asJson = process.argv.includes("--json");

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
    if (e.isDirectory()) {
      if (e.name === "agent-transcripts") continue; // raw chat logs — never "processed"
      walk(full, acc);
    } else if (e.name.endsWith(".md")) {
      acc.push(full);
    }
  }
  return acc;
}

// 1. Unprocessed docs: files whose frontmatter carries `processed: false`.
// `byFolder` powers the snapshot count; `files` is the exact list process-docs
// consumes so it never has to hand-walk folders either.
const unprocessed = {};
const unprocessedFiles = [];
for (const file of walk(docs)) {
  const head = (read(file) || "").slice(0, 800);
  if (/^processed:\s*false\s*$/m.test(head)) {
    const label = path.basename(path.dirname(file));
    unprocessed[label] = (unprocessed[label] || 0) + 1;
    unprocessedFiles.push(path.relative(root, file));
  }
}
const unprocessedTotal = unprocessedFiles.length;

// 2. Open decisions: dated bullet entries in docs/context/open-decisions.md.
const openDecRaw = read(path.join(docs, "context", "open-decisions.md"));
const openDecisions = [];
if (openDecRaw != null) {
  for (const line of openDecRaw.split("\n")) {
    const m = line.match(/^-\s+(\d{4}-\d{2}-\d{2}\b.*)$/);
    if (m) openDecisions.push(m[1].trim());
  }
}

// 3. Recent learnings: newest 3 bullets under "## Entries" (newest-first by convention).
const learnRaw = read(path.join(docs, "context", "learnings.md"));
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

// 4. Role placeholders: unfilled <TODO> markers in docs/context/people.md.
const peopleRaw = read(path.join(docs, "context", "people.md"));
const rolePlaceholders = peopleRaw == null ? null : (peopleRaw.match(/<TODO>/g) || []).length;

const missing = [
  openDecRaw == null && "docs/context/open-decisions.md",
  learnRaw == null && "docs/context/learnings.md",
  peopleRaw == null && "docs/context/people.md",
].filter(Boolean);

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      {
        unprocessed: { total: unprocessedTotal, byFolder: unprocessed, files: unprocessedFiles },
        openDecisions: openDecRaw == null ? null : openDecisions,
        recentLearnings: learnRaw == null ? null : learnings,
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
    lines.push("Unprocessed: all docs processed.");
  } else {
    const parts = Object.entries(unprocessed).map(([k, v]) => `${v} ${k}`);
    lines.push(`Unprocessed: ${parts.join(", ")} (${unprocessedTotal} total).`);
  }

  if (openDecRaw == null) {
    lines.push("Open decisions: (docs/context/open-decisions.md not present).");
  } else if (openDecisions.length === 0) {
    lines.push("Open decisions: none.");
  } else {
    lines.push(`Open decisions: ${openDecisions.length}.`);
    for (const d of openDecisions) lines.push(`  - ${d}`);
  }

  if (learnRaw == null) {
    lines.push("Recent learnings: (docs/context/learnings.md not present).");
  } else if (learnings.length === 0) {
    lines.push("Recent learnings: none yet.");
  } else {
    lines.push("Recent learnings:");
    for (const l of learnings) lines.push(`  - ${l}`);
  }

  if (peopleRaw == null) {
    lines.push("Roles: (docs/context/people.md not present).");
  } else if (rolePlaceholders > 0) {
    lines.push(`Roles: ${rolePlaceholders} <TODO> placeholder(s) in people.md.`);
  } else {
    lines.push("Roles: all filled.");
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}
