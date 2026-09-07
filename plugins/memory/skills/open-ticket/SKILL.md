---
name: open-ticket
description: Open a tracked work item — ensure the Asana anchor exists (create it if not) and materialize the local task cache under the memory mount.
pattern: procedure
when_to_use: A piece of actionable work needs tracking — a client request to build something, a bug, a scoped task — and there isn't already an open task for it.
when_not_to_use: Spawned/unattended runs — if REFACT_MEMORY_READONLY is set in your environment, do not use this skill; durable output goes in your run report / the propose→approve path. Recording a decision or outcome (use log-entry). A pending call that needs someone's decision lives in memory/knowledge/open-decisions.md, not a ticket.
inputs:
  - the ask, acceptance criteria, and any links (evidence paths that prompted it)
outputs:
  - an Asana task on the project board (the anchor) + memory/task/<gid>.md (local cache, uncommitted)
next_skills:
  - close-ticket
sub_agents: []
---

# Open Ticket

Read [runtime instructions](../../references/plugin-runtime.md) before using this skill.

**Spawned/unattended runs: if `REFACT_MEMORY_READONLY` is set in your environment, stop — durable output goes in your run report / the propose→approve path.**

**Asana is the system of record for work items** (memory-model §1/§6.1); `memory/task/` is a gitignored local cache of it, refreshed by the repo's link script. A work item without an Asana anchor is a hard stop for execution — this skill's job is to guarantee the anchor.

## Steps

1. **Resolve the board** from `.refact-os.json` → `asana.projectId`. If it is null or missing, say so and stop — the repo has no Asana anchor project yet; ask the human which board this repo tracks work on (then record it via `update-project-config`).
2. **Check for an existing task** — search `memory/task/*.md` and the board (`.refact-os.json` → `asana.projectUrl`) for the same ask. Don't duplicate.
3. **Create the Asana task** (the `asana` skill / API): name = the ask, notes = ask + acceptance criteria + links (cite `memory/evidence/…` paths that prompted it). The task notes are the ticket body — content lives on the task, not in a repo file.
4. **Refresh the cache:** run the repo's link script (`npm run link-memory` or `node scripts/link-memory.mjs` — it re-materializes `memory/task/<gid>.md`), or write the cache file directly in the same format.
5. Tell the user the task URL and the cache path.

## Notes

- The cache is derived and uncommitted — never `git add` anything under `task/`.
- **Tickets vs. open decisions:** a *pending call* is a row in `memory/knowledge/open-decisions.md` with an owner; a ticket tracks **actionable work**. They can coexist — link the open-decision id in the task notes rather than restating it.
- When the work finishes, hand off to `close-ticket` (outcome → tracker entry; task completed in Asana).
