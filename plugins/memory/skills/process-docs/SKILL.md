---
name: process-docs
description: Walk unprocessed evidence under the memory mount, integrate it into knowledge and tracker entries, and flip the processed flag.
pattern: procedure
when_to_use: The user asks to process / ingest / digest new docs or evidence backlog.
when_not_to_use: Spawned/unattended runs — if REFACT_MEMORY_READONLY is set in your environment, do not use this skill; durable output goes in your run report / the propose→approve path. Saving material that hasn't been captured yet (use ingest-input first).
next_skills: []
sub_agents: []
---

# Process Docs Reference

**Spawned/unattended runs: if `REFACT_MEMORY_READONLY` is set in your environment, stop — the mount is read-only for you; durable output goes in your run report / the propose→approve path.**

Use this when the user asks to process / ingest / digest new docs. Requires the mount: if `memory/` is missing or dangling, run the repo's link script (`npm run link-memory` or `node scripts/link-memory.mjs` — see the First-run section in `AGENTS.md`).

## What "processing" means

Locally-ingested evidence carries `processed: false` in its envelope. "Processing" means reading an unprocessed evidence file, integrating its information into the memory subtree (knowledge and tracker), and flipping the flag. Evidence **bodies are never edited** — only the `processed:` envelope line changes (the one sanctioned envelope flip).

## Workflow

### 0. Pull first

Refresh the refact-memory clone before reading or writing (resolve it: `realpath memory` → the clone root is the directory above `companies/`): `git -C <clone> pull --rebase --autostash`. Offline or pull fails? Proceed on the existing clone and say so.

### 1. Find unprocessed files

Deterministic question, script answer — run the shared scanner (from the repo root) and read its `unprocessed.files` list:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/project-status/scripts/scan-status.mjs --json
```

Every listed path is an evidence file with `processed: false`. That list is the work queue; the *judgment* about what each file means is yours, the *enumeration* is not.

### 2. For each unprocessed file, decide what to update

Read the file. Then update one or more of these, as appropriate:

- **A tracker entry** (via the `log-entry` skill) — if the file records something event-shaped: a finalized decision (`--type decision`, with the evidence path in `cites:` and the Data bullet), a delivery, a concern, an opportunity.
- **`memory/knowledge/open-decisions.md`** — if the file raises a question needing a human's call. Tag the responsible person from `memory/knowledge/people.md` (ask the user if the right person isn't there).
- **`memory/knowledge/people.md`** — if the file mentions a new person on either team.
- **`memory/knowledge/learnings.md`** — if the file contains a non-obvious durable preference or convention.
- **The canonical record** (via `update-canonical-record`) — if it changes standing truth.

A single file can update several targets; some update none — flip the flag regardless (step 3). Knowledge edits bump `last-verified:` on *every* touch.

### 3. Flip the flag

Change `processed: false` to `processed: true` in the evidence envelope. Touch nothing else in the file.

### 4. Commit, push, and report

One commit on the refact-memory clone: stage and commit `context(<company>/<project>): process N inputs` under your operator's own git identity (slugs from the mount path: `realpath memory` → `…/companies/<company>[/projects/<project>]`). Then `git -C <clone> push` — rejected? `pull --rebase --autostash` and push once more; still failing? Give the human the exact commands — never leave the commit silently local. Finish with a concise summary: files processed, entries written, knowledge docs touched.

## Guardrails

- **Never** record a decision without its source path in the Data bullet / `cites:` — traceability is the point.
- **Never** invent a person for `people.md` — unclear role → open question instead.
- **Never** flip `processed: true` on a file you skipped due to an error.
- Prefer **updating** an existing knowledge doc over adding a duplicate.
