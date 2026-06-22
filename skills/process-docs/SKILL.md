---
name: process-docs
description: Walk unprocessed files under docs/sources/raw/, integrate them into docs/context/, and flip the processed flag.
pattern: procedure
when_to_use: /refact process docs | ingest new emails | digest new inputs.
when_not_to_use: Saving material that hasn't been captured yet (use ingest-input first).
next_skills: []
sub_agents: []
---

# Process Docs Reference

Use this reference when the user invokes `/refact process-docs` (or asks to process / ingest / digest new docs).

## What "processing" means

Every file under `docs/` (except `agent-transcripts/`, which is for raw chat history) has a 3-line YAML header with a `processed` flag. "Processing" means reading an unprocessed file, integrating its information into `docs/context/`, and flipping the flag.

## Workflow

### 1. Find unprocessed files

Don't hand-walk folders to find them — "which files are unprocessed" is a deterministic question, so let a script answer it (a model eyeballing folders is right most times and silently off once). Run the shared scanner (the same one `project-status` uses) and read its `unprocessed.files` list:

```bash
node agent/skills/project-status/scripts/scan-status.mjs --json
```

Every path in `unprocessed.files` is a `.md` file with `processed: false` somewhere under `docs/` (raw chat logs in `agent-transcripts/` are already excluded). That list is your work queue for the steps below — the *judgment* about what each file means is yours; the *enumeration* is not.

### 2. For each unprocessed file, decide what to update

Read the file. Then update one or more of these, as appropriate:

- **`docs/decisions.md`** — if the file records a finalized decision. Include the source file path under `docs/` as part of the **Data** field of the entry.
- **`docs/context/open-decisions.md`** — if the file raises a question, ambiguity, or request that needs a human's call. Tag the responsible person from `docs/context/people.md`. If the right person isn't in roles, ask the user.
- **`docs/context/people.md`** — if the file mentions a new person on either team. Append a bullet with name + role.
- **`docs/context/learnings.md`** — if the file contains a non-obvious project/customer preference or convention worth remembering.

A single file can update multiple `docs/context/` files. Some files may update none — if the content is purely informational and not actionable, no `docs/context/` change is needed, but you still flip the header (see step 3).

### 3. Flip the header

After processing, change the file's header from `processed: false` to `processed: true`. Leave `source` and `added-by` untouched.

### 4. Report

Print a concise summary at the end:

```
Processed N files.

decisions.md: +X entries
open-decisions.md: +Y entries
people.md: +Z entries
learnings.md: +W bullets

Files processed:
- docs/sources/raw/email/2026-05-09-customer-feedback.md
- docs/sources/raw/call-transcripts/2026-05-10-weekly-sync.md
- ...
```

## Guardrails

- **Never** add an entry to `decisions.md` without including the source `docs/` file path as part of the **Data** field. Traceability is the whole point of that file.
- **Never** invent a person for `people.md`. If a name appears in a doc but the role is unclear, surface it as an open question instead.
- **Never** flip `processed: true` if you skipped the file due to an error — leave the flag as-is so it gets retried next time.
- If a file's content seems duplicated against an existing `docs/context/` entry, prefer **updating** the existing entry over adding a new one.
