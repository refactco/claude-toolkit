---
name: project-status
description: Report what's unprocessed, open decisions and their owners, recent learnings, and unfilled placeholders.
pattern: procedure
when_to_use: /refact status | what's pending | what's unprocessed.
when_not_to_use: Making a change — this is read-only reporting.
next_skills: []
sub_agents: []
---

# Status Reference

Use this when the user invokes `/refact status` (or asks "what's the status of the project context?").

## How it works

The scan — counting unprocessed files, open decisions, and role placeholders, and pulling recent learnings — is **deterministic work, so a script does it**, not the model. Eyeballing folders and counting by hand is exactly the kind of mechanical task a model gets *plausibly* wrong (right most times, silently off once). Run:

```bash
node agent/skills/project-status/scripts/scan-status.mjs
```

It prints a ready-to-show snapshot: unprocessed docs (grouped by folder), open decisions, recent learnings, and unfilled role placeholders. Add `--json` if you want to post-process the facts instead of showing them.

## What you do

1. Run the script from the repo root.
2. Present its output as the snapshot — it's already under ~20 lines and human-readable.
3. **Then** add the one thing the script can't: judgment. If something stands out — a pile of unprocessed inbound, a decision that's been open a long time, roles still unfilled — say so in a line and suggest the next move (`/refact process docs`, or resolving a specific decision). That interpretation is the only part of this skill that belongs to you.

## Scope

- This reports project **context** state, not repo health. Adapter drift, missing skill frontmatter, and structure checks are `refact-os validate`'s job — don't duplicate them here.
- Read-only. Don't modify any files.
- If the script reports a file as "not present," relay that — it's normal early in a project, since those `docs/context/` files are earned, not seeded.
