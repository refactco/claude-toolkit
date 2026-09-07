---
name: close-ticket
description: Close a tracked work item — record the outcome as a dated tracker entry in the memory mount and complete the Asana task.
pattern: procedure
when_to_use: A tracked work item is done or no longer needed.
when_not_to_use: Spawned/unattended runs — if REFACT_MEMORY_READONLY is set in your environment, do not use this skill; durable output goes in your run report / the propose→approve path. For opening a ticket (use open-ticket) or recording a decision that isn't a ticket outcome (use log-entry directly).
inputs:
  - the task (memory/task/<gid>.md cache entry or Asana URL) and its outcome
outputs:
  - memory/tracker/YYYY-MM-DD-<delivery|note>-<slug>.md + the Asana task completed
next_skills: []
sub_agents: []
---

# Close Ticket

Read [runtime instructions](../../references/plugin-runtime.md) before using this skill.

**Spawned/unattended runs: if `REFACT_MEMORY_READONLY` is set in your environment, stop — durable output goes in your run report / the propose→approve path.**

The durable residue of a closed ticket is a **tracker entry** (memory-model §6.1); Asana keeps the task history. Nothing under `task/` is ever committed.

## Steps

1. Read the task (cache file under `memory/task/`, or the board via `.refact-os.json` → `asana.projectId`; if that is null, say so and stop) and establish the outcome.
2. **Record the outcome** via `log-entry`: `--type delivery` for shipped work, `--type note` for obsolete/won't-fix — title + one-paragraph outcome, `(was: Asana <gid>)`, evidence/PR links in the body. (log-entry owns the pull → commit → push sequence on the clone.)
3. **Complete the task in Asana** (the `asana` skill / API), with a closing comment linking the tracker entry path.
4. Refresh the cache (run the repo's link script — `npm run link-memory` or `node scripts/link-memory.mjs`) so the completed task drops out of `memory/task/`.
5. If the work finalized a decision beyond the outcome itself, record it separately (`log-entry --type decision`).

## Notes

- Check `memory/tracker/` first to avoid a duplicate outcome entry.
- Keep the entry terse — title, date, outcome, links. The task's full history stays in Asana.
