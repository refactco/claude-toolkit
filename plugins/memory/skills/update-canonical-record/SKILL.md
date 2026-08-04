---
name: update-canonical-record
description: Make a surgical, cited edit to the project's canonical truth in the memory mount (project.md or the named knowledge spec) when synthesized knowledge changes.
pattern: procedure
when_to_use: New synthesized truth needs to be reflected in the canonical record — a confirmed decision, a scope change, a resolved open question.
when_not_to_use: Spawned/unattended runs — if REFACT_MEMORY_READONLY is set in your environment, do not use this skill; durable output goes in your run report / the propose→approve path. For raw inbound material (use ingest-input) or event records (use log-entry). Don't edit the canonical record from unverified evidence. Live working documents — active plans, sprint registers (DEC/RISK/Q), drafts, status boards — stay in the repo's docs/; this skill is for settled truth only. A file migrates when its working life ends (lifecycle, not location).
inputs:
  - the canonical record on the mount (memory/project.md, or the knowledge doc it names)
  - supporting evidence under memory/evidence/ and tracker entries under memory/tracker/
outputs:
  - a surgical edit to the canonical record, last-verified bumped, with a citation to the source
next_skills: []
sub_agents: []
---

# Update Canonical Record

**Spawned/unattended runs: if `REFACT_MEMORY_READONLY` is set in your environment, stop — the mount is read-only for you; durable output goes in your run report / the propose→approve path.**

The canonical record lives on the mount: **`memory/project.md`** (the standing overview; `memory/company.md` at company level) and the knowledge docs it names as current truth. Requires the mount: if `memory/` is missing or dangling, run the repo's link script (`npm run link-memory` or `node scripts/link-memory.mjs` — see the First-run section in `AGENTS.md`).

## Steps

1. **On main, then pull** — confirm the refact-memory clone is on `main` (`git -C <clone> rev-parse --abbrev-ref HEAD`; resolve it: `realpath memory` → the clone root is the directory above `companies/`). Any other branch ⇒ stop and tell the human — the mount is serving branch content. Then refresh before editing: `git -C <clone> pull --rebase --autostash`. Offline or pull fails? Proceed on the existing clone and say so.
2. Orient on `memory/project.md` — it names which knowledge doc is canonical for the area you're touching.
3. Make the **smallest edit** that captures the new truth. Cite the source — an evidence path (add it to `cites:`), a tracker entry, a PR.
4. **Bump `last-verified:`** on every touched knowledge file, even for trivial edits — that is what the date means.
5. If the change conflicts with existing text, record the contradiction rather than silently overwriting — note both and flag for a human.
6. If this finalizes a decision, also record it via `log-entry --type decision`.
7. **Commit and push** on the refact-memory clone:
   - Stage and commit `context(<company>/<project>): <what>` under your operator's own git identity (slugs from the mount path).
   - `git -C <clone> push`. Rejected (non-fast-forward)? `git -C <clone> pull --rebase --autostash`, then push once more. Still failing? Give the human the exact commands to run — never leave the commit silently local.

## Hard rules

- Knowledge wins over evidence on conflict, but only *after* synthesis — never promote an unverified claim straight into the record.
- Surgical edits only. Don't rewrite whole sections to make one change.
- Never edit `status: archived` docs to "update" them — a revived topic gets a new active doc or a status flip with its tracker entry (the log-entry archive move, in reverse, on the record).
- Placement is project-first: company-level knowledge is a deliberate cross-project judgment, never a fallback.
