---
name: extract-learnings
description: Capture a durable, generalizable learning — a preference, project convention, workflow/infra fact, or hard-won approach — into docs/context/learnings.md.
pattern: procedure
when_to_use: A turn revealed something durable — a user preference, a project convention, a generalizable correction, a workflow/infra fact, or a working approach found after trial-and-error. MUST self-check at the end of any multi-step session that established a new file/convention or pinned down setup wiring.
when_not_to_use: Routine work that revealed nothing new, one-off debugging steps, or facts already in docs/decisions.md or docs/context/learnings.md.
next_skills: []
sub_agents: []
---

# Extract Learnings

Write down **non-obvious** things from the current chat — user preferences, project conventions, recurring mistakes, hard-won setup recipes — before they're lost.

> **This skill is the project's memory of record, and it takes precedence over personal/global agent memory.** Capture durable *project* facts here, in `docs/context/learnings.md` — do **not** also write the same fact to `~/.claude/projects/<dir>/memory/`. The repo is the shared brain; per-user memory is not.

## When to invoke

Fire when the turn revealed one of these:

- Something about the user worth carrying forward — role, expertise, style, environment, tool preferences.
- An expectation about how the agent should behave.
- A project convention not already in `docs/context/`.
- A correction that generalizes (not a one-off).
- A concrete workflow fact (branch naming, deploy scripts, review cadence).
- **A working approach found after trial-and-error.** The winning approach is non-obvious by definition — capture it (plus any gotchas that ruled out wrong paths). Example: "Config changes in `<file>` need a dev-server restart to apply — they aren't hot-reloaded."
- **Infra wiring that only becomes true after setup** — which command must run after which edit, which port maps to which domain, which env file holds which secrets, which service restart is required for changes to take effect.

Skip when:

- The turn was routine work and nothing new was revealed.
- Already covered in `docs/decisions.md` or `docs/context/learnings.md`.
- It was a one-off debugging step with no generalizable rule (one bad commit, one stale cache, one transient network blip).
- The information is trivially derivable by reading the code, running `git log`, or following an existing doc.

Most turns won't trigger this. When unsure, don't fire. **But always self-check at the end of any multi-step session**: *"what did I discover or establish here that the next session would need to know on day one?"* — if the answer is non-empty, capture it. Even a sprawling setup compresses to one bullet that names the key files/paths/commands.

## Workflow

### 1. Identify the learning

Re-read recent turns and ask:

- Did I try multiple approaches before one worked? → The winning approach is a learning.
- Did I create a file with a specific role (override, example, secrets, proxy config)? → That role is a learning.
- Did I install or configure infra (reverse proxy, DNS, certs, hosts file)? → The wiring is a learning.
- Did the user push back on, or confirm, an unusual choice? → That feedback is a learning.
- Did `.gitignore`, environment, or how secrets flow change? → Capture the new convention.
- Did a command sequence become load-bearing for future setups? → Capture the recipe (one line, naming the entry points).

Zero bullets is fine — don't pad. Skip anything already in `docs/context/learnings.md` or `docs/decisions.md`.

### 2. Append to `docs/context/learnings.md`

Create `docs/context/learnings.md` (with an `## Entries` heading) if it does not exist yet. Under the `## Entries` heading, **newest first**:

```
- YYYY-MM-DD — one-line learning.
```

- Use today's date from the current-date system reminder.
- One bullet, one idea. A complex setup still fits one line — name the key files/paths/commands; the detail lives in the code itself.
- If it truly cannot be distilled to one line, write it to `docs/context/open-decisions.md` (or a dedicated doc under `docs/`) and tell the user.
- Append only. **Never** rewrite or reorder existing entries.

### 3. Report

One short sentence:

- Captured: `Captured learning: <bullet>.`
- Nothing durable: stay silent.

## Guardrails

- **Never** rewrite or reorder existing entries in `docs/context/learnings.md`. Append-only.
- **Never** delete unrelated entries without the user's say-so.
- **Never** paste raw chat excerpts. Distill, don't quote.