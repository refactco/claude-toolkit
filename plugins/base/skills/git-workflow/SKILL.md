---
name: git-workflow
description: Handle the git for any committed change — branch, commit, open the PR — in plain language, so anyone (technical or not) can contribute safely without touching the shared base branch.
pattern: procedure
when_to_use: Any change that will be committed (code, docs, content, config, deliverables) — "save my changes", "I'm done", "publish this", "push it up", "open a PR" — or when a git step fails or blocks you. This is the gate every change passes through, before the first edit and again when it's ready to share.
when_not_to_use: First-time repository creation / creating the GitHub remote. Read-only questions, exploration, or chat-history / transcript processing.
next_skills: []
sub_agents: []
---

# Git Workflow

Read [runtime instructions](../../references/plugin-runtime.md) before using this skill.

This skill handles **all the git** for you. Say what you want in plain words — the agent does the
right thing and keeps the shared project safe. Every committed change (code, docs, content,
config, deliverable) passes through here.

> **Why this file is short (do not undo this):** the body keeps only one-liners and the request
> map, so it costs little context. The exact commands live in three references that load only when
> needed. Do **not** move detail back in here, and do **not** trim the safety one-liners below "to
> de-duplicate" — several are load-bearing and must stay visible on every run, before any reference
> is opened.

## The one rule that keeps everyone safe

Never change the shared **base** branch directly. Your work happens on **your own branch**, and you
offer it back with a **pull request (PR)** so it can be reviewed. The agent enforces this — it
**never** commits straight to base, not even for a one-word fix.

## Read what the person wants, then do the git

People rarely say "create a branch." Map the request to the action — don't make anyone learn git
words.

| If they say… | Do this |
|---|---|
| starts any change — "let's edit…", "add…", "fix…", "update…" | **Before editing:** be on a **fresh branch off the latest base** (create one if still on base). |
| "save this" / "I'm done" / "keep that" / "commit it" | **Commit** the current changes with a short, clear message. |
| "send it" / "publish" / "push it up" / "open a PR" | **Push** the branch and **open a PR** into base; reply with the link and whether CI passed. |
| "what's going on?" / "where are we?" | Show the current branch, what changed, and any open PR — in plain words. |
| "undo that" / "go back" | Explain safe options (revert last commit vs. discard uncommitted); **confirm before anything that deletes work**. |
| "clean up the repo" / "tidy the branches" / "prune merged branches" | Prune only fully-merged work branches → [`references/cleanup.md`](references/cleanup.md). |
| a git step fails or blocks you | → [`references/recovery.md`](references/recovery.md). |

When a request is ambiguous, pick the **safe** reading, do it, and say what you did in one sentence
— e.g. *"Saved your changes on `docs/pricing-update` and opened a PR: <link>."*

## The happy path (compact)

Exact branch naming, commit style, and the PR template are in
[`references/happy-path.md`](references/happy-path.md) — **that file is the canonical source**; the
block below is only a skeleton. When they differ, `happy-path.md` wins.

```bash
# base: prefer AGENTS.md; else `git remote show origin | sed -n 's/.*HEAD branch: //p'`; else ask once & record
git fetch origin && git switch <base> && git pull --ff-only origin <base>
git switch -c feat/<ticket>-<slug>          # feat | fix | chore | docs | content | refactor + kebab slug
git add <paths>                             # explicit paths — never `git add -A`
git commit -m "<type>(<scope>): <subject>"  # Conventional Commits
git push -u origin feat/<ticket>-<slug>
gh pr create --base <base> --title "…" --body "…"   # Summary / Why / Test plan
# ^ first Why bullet: `Refs asana#<gid>` (or `Closes asana#<gid>`) — how tooling matches PR → ticket
```

Then report the PR URL and whether CI passed. **Detect the base, don't assume it** — if it stays
unclear after the checks in the block above, ask once and record the answer in `AGENTS.md`.

## Hard rules (never — these apply on every run, whatever file is open)

- **Never commit or push to the base branch** — branch first, always, even for a one-word fix.
- **Never open a PR into `main`** when the repo integrates via a separate branch (e.g. `stage` /
  `develop`) — unless the user asks for a `stage → main` promotion.
- **Never force-push, `git reset --hard`, `git clean -fd`, or delete a branch** without explicit
  confirmation — these destroy work.
- **Push rejected → never force-push and never rebase to fix it.** Merge the latest base in
  (`git merge --ff-only origin/<base>`, else a plain merge commit — still no force push). Detail in
  [`references/recovery.md`](references/recovery.md).
- **Cleanup deletes only fully-merged, convention-named work branches** — `feat/`, `fix/`, `chore/`,
  `docs/`, `content/`, `refactor/` — with the safe `-d` flag. **Never** an unmerged branch, **never**
  a branch with no work prefix even if merged, and **never** `main`, `master`, `dev`, `develop`,
  `stage`, `staging`, or `stg`.
- **Never skip hooks** (`--no-verify`) and never amend an already-pushed commit on a shared branch.
- **Surface CI failures** in plain words — never hide them, silently re-run, or rewrite history to
  mask them.
- When in doubt, **stop and surface the problem in plain words** rather than guessing.

## References

| When | File |
|---|---|
| Exact commands — base detection, branch naming, commit style, push, PR template | [`references/happy-path.md`](references/happy-path.md) |
| A step blocks you (push rejected, CI red, conflict, dirty tree, `gh` auth, base wrong) | [`references/recovery.md`](references/recovery.md) |
| Prune merged branches on a "clean up" request | [`references/cleanup.md`](references/cleanup.md) |
