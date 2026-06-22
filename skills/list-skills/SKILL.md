---
name: list-skills
description: List the skills already installed in this repo, with their pattern and when_to_use, so you can find and reuse an existing skill before authoring a new one.
pattern: procedure
when_to_use: Before authoring or proposing a new skill; when the user asks what skills or capabilities exist ("what can you do here", "list the skills"); when planning work and you need to check whether a capability already exists.
when_not_to_use: When you already know which skill applies — just load and use it.
next_skills:
  - create-skill
sub_agents: []
---

# List Skills

Discover what this repo can already do, so you reuse an existing skill instead of
reinventing one. This is the **first step before `create-skill`** — most "I need a
new skill" moments are already covered.

## Steps

1. Run the scan script and read its output (don't enumerate skills by hand):

   ```bash
   node agent/scripts/list-skills.mjs
   ```

   Each entry shows the skill's `name`, `pattern`, one-line `description`, and
   `when_to_use`. Use `--json` if you want to filter or post-process the list.

2. Match the user's goal against the listed `when_to_use` lines.
   - **A skill fits** → tell the user which one and load it (or route via `/refact`).
   - **Something is close but not exact** → prefer adapting the existing skill over
     making a near-duplicate.
   - **Nothing fits** → only then consider authoring one. Hand off to `create-skill`,
     which will re-check this list before scaffolding.

3. Report concisely: the relevant skill(s) for the task, or "nothing covers this —
   the closest is X" so the user can decide between reuse and authoring.

## Notes

- This lists skills **installed in this repo** (`agent/skills/`). The refact-os
  catalog of additional packs you can pull in is surfaced separately by `get-skill`
  (when available) — mention it if the gap looks like a known capability area
  (WordPress, Next.js, deploys, client deliverables) rather than something bespoke.
- Skills are the canonical move set; `.cursor/` and `.claude/` are generated mirrors.
  Never read or edit those to discover skills — always `agent/skills/`.
