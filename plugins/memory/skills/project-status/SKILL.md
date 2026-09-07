---
name: project-status
description: Report unprocessed evidence, open decisions and their owners, recent learnings and tracker entries, and unfilled placeholders — read through the memory mount.
pattern: procedure
when_to_use: What's pending | what's unprocessed | the status of the project context.
when_not_to_use: Spawned/unattended runs — if REFACT_MEMORY_READONLY is set in your environment, do not use this skill; your spawn already received a memory digest. Making a change — this is read-only reporting.
next_skills: []
sub_agents: []
---

# Status Reference

Read [runtime instructions](../../references/plugin-runtime.md) before using this skill.

**Spawned/unattended runs: if `REFACT_MEMORY_READONLY` is set in your environment, do not use this skill — your spawn already received a memory digest at mount time.**

Use this when the user asks "what's the status of the project context?" (or what's pending / unprocessed).

## How it works

The scan — counting unprocessed evidence, open decisions, recent learnings/tracker entries, role placeholders — is **deterministic work, so a script does it**, not the model. Run from the repo root (the script reads `./memory` relative to your working directory):

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/project-status/scripts/scan-status.mjs
```

It reads through the `memory/` mount and prints a ready-to-show snapshot. Add `--json` to post-process the facts instead of showing them. If it reports the mount missing, run the repo's link script first (`npm run link-memory` or `node scripts/link-memory.mjs`).

## What you do

1. Run the script from the repo root.
2. Present its output as the snapshot — it's already short and human-readable.
3. **Then** add the one thing the script can't: judgment. A pile of unprocessed evidence, a decision open too long, stale-looking knowledge — say so in a line and suggest the next move (process-docs, or resolving a specific decision).

## Scope

- This reports project **context** state, not repo health.
- Read-only. Don't modify any files.
- "Not present" findings are normal — memory files are earned, not seeded.
