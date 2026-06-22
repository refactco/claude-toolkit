---
name: create-skill
description: Scaffold a new skill under agent/skills/ with correct resolver frontmatter — after checking existing skills — then re-sync the adapters. For repeatable moves not yet covered.
pattern: procedure
when_to_use: A repeatable move has recurred (about the third time) and no existing skill covers it; or the user explicitly asks to add/author a skill. Always run list-skills first to avoid a near-duplicate.
when_not_to_use: The move is a one-off (just do it); or an existing skill already covers it (reuse or adapt that instead — check with list-skills).
next_skills: []
sub_agents: []
---

# Create Skill

Turn a recurring move into a reusable skill. A skill is **process, not content**: it
encodes *how* to do something and reads project facts from `docs/` rather than baking
them in.

## Before you scaffold

1. **Check it doesn't already exist** — run `list-skills`. If something fits or is
   close, reuse or adapt it instead of making a near-duplicate. Stop here if covered.
2. **Confirm the move has earned a skill** — the rule of thumb is the **third** time
   you make the same move. The first time, just do it; the second, note it; the third,
   capture it. Don't pre-build skills for moves that haven't recurred.
3. **Decide local vs. global** with the rubric below. It changes nothing about *how*
   you author here — both are authored locally first — but it tells you whether to flag
   it for promotion afterward.

### Local-vs-global rubric

A skill is **global** (a candidate for the shared refact-os catalog, used across every
engagement) when **all** of these hold:

- **Process, not content** — reads project facts from `docs/`, doesn't bake them in.
- **Reusable across engagements** — at least two plausible projects would want it.
- **No company-private data** — no client names, secrets, or one-repo-specific context.
- **Stable** — the procedure isn't churning week to week.

Otherwise it's **local**: project-specific, bespoke, or it embeds this engagement's
facts. **When unsure, keep it local** — promotion is cheap later, but a bad global skill
pollutes every repo. (Promoting a local skill to the catalog will be handled by the
`contribute-skill` flow; until then, note the candidate in the ticket or learnings.)

## Scaffold

1. Pick a `<verb-object>` folder name (e.g. `summarize-call`, `draft-proposal`). Create
   `agent/skills/<verb-object>/SKILL.md` with the full resolver frontmatter:

   ```yaml
   ---
   name: <verb-object>            # must match the folder name
   description: <100–200 chars; what it does + the trigger. Read at every selection.>
   pattern: procedure             # procedure | orchestrator | review
   when_to_use: <the "might fit" signal — phrases/situations that select this skill>
   when_not_to_use: <the "but not when…" — prevents misfires toward neighbours>
   next_skills: []                # skills this leads to; [] if terminal (must exist)
   sub_agents: []
   ---
   ```

   Required fields (the validator enforces): `name`, `description`, `when_to_use`,
   `pattern`. Declare `next_skills` explicitly (`[]` if terminal) so a terminal chain
   reads as intentional. `pattern` must be one of `procedure`, `orchestrator`, `review`;
   an `orchestrator` must reference at least one other skill via `next_skills`/`sub_agents`.

2. Write the body as steps. Keep it a **map, not a manual**: link to `docs/` and other
   skills rather than restating them.

3. **Put any counting / scanning / parsing in a script** the skill runs
   (`agent/scripts/<name>.mjs`), so the model interprets results rather than enumerating
   by hand — like `list-skills.mjs`. Reach for a script the skill calls, not a new
   always-on tool.

## Sync and verify

```bash
npm run refact:sync       # regenerate .cursor/ and .claude/ from agent/
npm run refact:validate   # check frontmatter + that next_skills references resolve
```

If `validate` flags drift or a missing field, fix the frontmatter and re-run. Never edit
`.cursor/` or `.claude/` by hand — change `agent/` and re-sync.

## Report

Tell the user the skill name, whether you classed it local or global (and why, per the
rubric), and that it's now selectable. If global, note it as a promotion candidate.
