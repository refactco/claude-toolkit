# Plan — make the `git-workflow` skill use less context

> Planning document. Written 2026-07-09. **Review first, do not auto-execute.**
> Split into **NOW** (the edits to make) and **LATER** (apply the same idea to other heavy skills).
> No skill files are changed by this document. It only describes the change.

## Why this matters

We got feedback that `git-workflow` takes a lot of the context window (the space the model
can "see"). This is true, and it happens on almost every session — because `code-development`
defers to `git-workflow`, so it fires on nearly every commit.

## The cause (measured)

Here is how Claude Code loads a skill. This is from the official docs
(`code.claude.com/docs/en/skills.md`, `context-window.md`).

| Part of the skill | When it loads into context |
|---|---|
| The `description` field | Always, at session start. Small — not the problem. |
| The `SKILL.md` body (~7,300 chars) | Only when the skill fires. Then it stays all session. |
| `references/git-workflow.md` (~10,800 chars) | Only when the body tells the agent to read it. |

The problem is one line in `SKILL.md`:

> *"Follow `references/git-workflow.md` end-to-end …"*

So the agent reads the **whole** reference. That means about **4,500 tokens** load.

**Important: this is a one-time, persistent cost, not a per-commit cost.** A skill loads once
and then stays for the rest of the session. The docs are clear
(`code.claude.com/docs/en/skills.md`, section "Skill content lifecycle"):

> "When you or Claude invoke a skill, the rendered `SKILL.md` content enters the conversation
> as a single message and **stays there for the rest of the session**. Claude Code does not
> re-read the skill file on later turns."

> "When Claude re-invokes a skill whose rendered content is identical to the copy already in
> context, Claude Code adds a short note that the skill is already loaded **rather than a
> second copy of the content**." (This dedup is v2.1.202+.)

So the ~4,500 tokens are **loaded once and then sit in context all session** — a recurring
cost on every later turn because the text stays. The docs say it plainly: *"Once a skill loads,
its content stays in context across turns, so every line is a recurring token cost."*

Note one nuance: the **reference** file is loaded by the **Read tool** (because the body says
to read it), not by skill invocation, so it does not get the skill's "already loaded" dedup.

On top of all this, the body and the reference repeat the same things twice (hard rules, the
blocker table, the cleanup rules).

## Does a cheaper model help? No.

This was the main question. The answer is **no, a cheaper model does not save context.**

- The skill text is the **same number of tokens** on any model in the same family.
  Haiku, Sonnet, and Opus use the **same tokenizer** (the tool that splits text into tokens).
- So text that costs ~4,500 tokens on Opus costs about the same on Haiku.
- A cheaper model only lowers **money cost** and **speed**. It does **not** shrink the text.

> Note: token counts only differ across model *generations*, not across size tiers in one
> family. So switching Opus → Haiku changes price, not context size.

**What does save context:** make the text smaller, and split it so only the needed part loads.

### The sub-agent (`context: fork`) option — not for this skill

There is a real way to move a skill's text out of the main chat: run it in a sub-agent with
`context: fork`. Then the skill body and all git command output live in the sub-agent's own
window, and only a short result comes back to the main chat. A cheaper model there would save
money too.

**But this does not fit `git-workflow`.** This skill has to ask questions and wait for a yes/no
("Which branch is the base?", "Confirm before I delete?"). A `context: fork` sub-agent has no
chat history and returns only one final answer — it cannot go back and forth. Forking it would
break its ask-and-confirm safety. So keep `git-workflow` in the main chat, and get the savings
from trim + split instead.

---

## NOW — the change to make

Turn `SKILL.md` into a thin router. Split the one big reference into three, so the agent loads
only the part it needs.

### New file layout

| File | Loads when | Target size |
|---|---|---|
| `SKILL.md` (thin router) | Every time (unchanged trigger) | ~3,000 chars |
| `references/happy-path.md` | A non-trivial change needs exact naming / commit style / PR template | ~3,200 |
| `references/recovery.md` | A step **blocks** you (push rejected, CI red, conflict, dirty tree, `gh` auth, base wrong) | ~2,400 |
| `references/cleanup.md` | Only a "clean up / tidy / prune branches" request | ~2,600 |

### Context per session — before vs after

| Case | Now | After |
|---|---|---|
| Normal commit + open PR | ~4,500 tokens | ~750–1,550 |
| A step blocks you | ~4,500 | ~1,350 |
| Clean up branches | ~4,500 | ~1,400 |

A normal commit drops from ~4,500 to roughly **750–1,550 tokens** — about a **3–6× cut**.
The recovery and cleanup detail only load when they are actually needed.

> The "after" for a normal commit is a range, not one number. If the agent trusts the compact
> command block in `SKILL.md`, it is near ~750. If it also opens `happy-path.md` for the PR
> template, it rises to ~1,550. Both are a big cut versus ~4,500.

### What goes where (mapping from today's files)

**`SKILL.md` (thin router)** keeps only:
- The one rule ("never change the shared/base branch directly").
- The request → action table (map plain words to the git action).
- The **full** "never" hard-rules list, as short one-liners (safety must always be visible).
- A **compact** happy-path command block: detect base → branch → `add` → `commit` → `push` →
  `gh pr create`.
- A 3-row pointer table to the three reference files.

**`references/happy-path.md`** holds today's reference Steps 1a–7: preflight, base-branch
detection commands, sync, branch-naming table, Conventional Commits style, staging hygiene
(explicit paths), push, `gh pr create` + the PR body template, respond-to-review, and the
`git branch -d` delete.

**`references/recovery.md`** holds the blocker handling: one table with a plain-words
"what happened / say this" column and a "recovery command" column (dirty tree, on base branch,
merge conflict, push rejected, CI red, `gh` not authed, base wrong), plus the
"When to stop and ask" checklist.

**`references/cleanup.md`** holds the prune-merged-branches steps and its guardrails.

### Three safety fixes that MUST be in (do not skip)

An adversarial safety check said the plan is safe **only** if these hold. They stop a safety
rule from becoming unreachable (a rule the agent would only read *after* it could do damage).

1. **Keep the full "never" list inline in `SKILL.md`.** Two lines are load-bearing and must
   stay in the always-loaded body, **not** move into `recovery.md` only:
   - *"push rejected → never force-push, never rebase; merge the base in."*
   - *"surface CI failures — never hide, re-run, or rewrite history to mask them."*
   A blocked agent could act before it opens `recovery.md`, so these must load every time.
2. **Keep the cleanup guardrail complete inline.** The draft dropped the work-branch allow-list
   (`feat/ fix/ chore/ docs/ content/ refactor/`) and the "never touch an unprefixed branch,
   even if merged" rule. That is a real loosening versus today. Put it back in the one-liner.
3. **Mark `happy-path.md` as the one true source** for commands / naming / PR template, so the
   compact block in `SKILL.md` cannot drift out of sync over time.

Also add a short design note in `SKILL.md`: *"This body holds only one-liners + the request map.
Detail lives in the three references. Do not re-add blocker or cleanup prose here — and never
trim the inline safety one-liners 'to de-duplicate'."* This stops the duplication creeping back.

### Version + delivery

- Bump `plugins/base` version `1.4.2` → `1.5.0` (a skill restructure) in **both**
  `plugins/base/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, and bump the
  top-level marketplace `version` (`2.9.1`).
- Add a `docs/change-log.md` entry.
- Ship via `git-workflow` itself: a branch (`chore/slim-git-workflow-skill`) and a PR into
  `main`. No direct commit to `main`.
- After merge, restart the session so Claude Code re-reads the skill.

---

## LATER — apply the same idea to other heavy skills

The same "thin body + split references, load on demand" pattern helps the biggest skills too.
By `SKILL.md` size today:

| Skill | `SKILL.md` size | Note |
|---|---|---|
| `wordpress/wp-env` | ~55,500 chars | Biggest. Strong candidate to split. |
| `wordpress/plugin-update` | ~37,900 | Split QA steps / rollback into references. |
| `testing/integration-tests` | ~26,400 | |
| `testing/backfill-tests` | ~20,700 | |
| `base/sync-env-vars` | ~18,000 | |
| `ops/cloudflare` | ~15,000 | |

General rule to adopt for all skills:

- `SKILL.md` body = **what to do** + the safety rules that must always be visible. Keep it
  small (docs say under 500 lines).
- Long **how-to** detail, tables, and templates go in `references/*.md`, loaded only when needed.
- Never tell the body to "read the reference end-to-end" unless it truly is needed every time.

This is a separate task. Do `git-workflow` first, confirm the win with `/context`, then repeat.
