---
name: log-entry
description: Write a dated tracker entry (decision, update, meeting, milestone, concern, opportunity, delivery, release, note) into the memory mount, with the envelope and id the memory model requires. Also owns the knowledge-archive move (flip status + record the outcome in one act).
pattern: procedure
when_to_use: Something event-shaped needs recording — a decision was made, a meeting happened, work shipped, a concern surfaced. Also when archiving a finished knowledge doc.
when_not_to_use: Spawned/unattended runs — if REFACT_MEMORY_READONLY is set in your environment, do not use this skill; durable output goes in your run report / the propose→approve path. Inbound material from outside (use ingest-input — that is evidence, not a tracker claim). Standing truth edits (edit the knowledge doc; use update-canonical-record for the canonical record). Anything needing client review — this writes directly, for human-gated local sessions only.
inputs:
  - the entry type and what happened
outputs:
  - memory/tracker/YYYY-MM-DD-<type>-<slug>.md with a full envelope
next_skills: []
sub_agents: []
---

# Log Entry

**Spawned/unattended runs: if `REFACT_MEMORY_READONLY` is set in your environment, stop — the mount is read-only for you; durable output goes in your run report / the propose→approve path.**

Tracker writes on the mount. The schema is `memory-model.md` in refact-memory (§3.2 tracker, §3.3 vocabularies) — this skill applies it. Requires the mount: if `memory/` is missing or dangling, run the repo's link script (`npm run link-memory` or `node scripts/link-memory.mjs` — see the First-run section in `AGENTS.md`). Your company/project slugs come from the mount path: `realpath memory` → `…/companies/<company>[/projects/<project>]`.

## Steps

1. **Type** (argument or inferred): `note | update | milestone | decision | delivery | concern | opportunity | company-change | release | meeting | agenda`.
2. **On main, then pull** — confirm the refact-memory clone is on `main` (`git -C <clone> rev-parse --abbrev-ref HEAD`; the clone root is the directory above `companies/` in the resolved mount path). Any other branch ⇒ stop and tell the human — the mount is serving branch content. Then refresh before writing: `git -C <clone> pull --rebase --autostash`. Offline or pull fails? Proceed on the existing clone and say so.
3. **Write `memory/tracker/YYYY-MM-DD-<type>-<slug>.md`** (today's date unless the event has its own; short stable slug):

   ```yaml
   ---
   id: TRK-<date>-<slug>
   class: tracker
   type: <type>
   title: "<one line>"
   company: <company-slug>
   project: <project-slug>    # omit for company-level entries
   occurred: <event date>
   author: <your operator's email, or "agent">
   source: manual
   created: <today>
   ---
   Body.
   ```

4. **Per-type required content:**
   - `decision` — body carries **Decision / Why / Data / Owner** bullets. Data must cite sources (evidence paths via `cites:`, file paths, PR/ticket ids) — a decision without its data is not recordable.
   - `meeting` — `## Participants` and `## Action items` sections; `recording-url:` if one exists.
   - `release` — flat `version:` and `link:` keys; highlights as body sections.
   - `concern`/`opportunity` — name the client impact and the owner in the body.
5. **Relations:** correcting a wrong entry? Add `supersedes:` with the replaced path(s) — never edit or delete the old entry (retraction convention, memory-model §3.5). Tracing to received material? Add `cites:` with `evidence/` paths.
6. **Lint, commit, push** on the refact-memory clone — direct commit to `main` is correct for human-gated session writes (writer set, refact-memory `AGENTS.md`):
   - Lint before committing: `python3 <clone>/lint/envelope_lint.py` — the same check CI runs; fix what it flags (relation paths in `cites:`/`supersedes:` are **repo-root-relative**, `companies/…`). The clone's pre-commit hook runs it too; never bypass with `--no-verify`.
   - Stage and commit `context(<company>/<project>): <what>` under your operator's own git identity.
   - `git -C <clone> push`. Rejected (non-fast-forward)? `git -C <clone> pull --rebase --autostash`, then push once more. Still failing? Give the human the exact commands to run — never leave the commit silently local. (This mirrors the VPS executor's `write_and_push()` discipline.)

## The archive move (knowledge)

When a plan/doc is finished or shelved: flip its `status: active → archived` in the knowledge file **and** write the outcome tracker entry (usually `delivery` or `note`) in the same commit. Never one without the other — a plan must not disappear without its result on the record.

## Hard rules

- Tracker is append-only: never edit an existing entry's body — supersede it.
- One event, one file. No batching unrelated events into one entry.
- `agenda` is executor-owned (upserted by the workflow path); don't hand-write agendas here unless asked.
- Placement is project-first: anything attributable to a project goes under the project subtree; company level is a deliberate cross-project judgment, never a fallback.
