---
name: git-workflow
description: Handle the git for any committed change — branch, commit, open the PR — in plain language, so anyone (technical or not) can contribute safely without touching the shared base branch.
pattern: procedure
when_to_use: Any change that will be committed (code, docs, content, config, deliverables) — "save my changes", "I'm done", "publish this", "push it up", "open a PR" — or when a git step fails or blocks you. This is the gate every change passes through, before the first edit and again when it's ready to share.
when_not_to_use: First-time repository creation / creating the GitHub remote (use git-it). Read-only questions, exploration, or chat-history / transcript processing (those go through /refact).
next_skills: []
sub_agents: []
---

# Git Workflow

This skill handles **all the git** for you. Nobody using the repo needs to know git
commands — say what you want in plain words, and the agent does the right thing while
keeping the shared project safe. It is the single gate every committed change passes
through, whether that change is code, a document, content, or a client deliverable.

## The one rule that keeps everyone safe

Never change the shared branch directly. Your work always happens on **your own branch**,
and you offer it back with a **pull request (PR)** so it can be reviewed before it becomes
official. The agent enforces this automatically — it will **never** commit straight to the
base branch, not even for a tiny change.

## Read what the person wants, then do the git

People rarely say "create a branch." They say the things on the left. Map the request to
the action — don't make a non-technical person learn git words.

| If they say… | Do this |
|---|---|
| starts asking for any change — "let's edit…", "add…", "fix…", "update…" | **Before editing:** make sure we're on a **fresh branch off the latest base** (create one if we're still on the base branch). |
| "save this" / "I'm done" / "keep that" / "commit it" | **Commit** the current changes with a short, clear message describing what changed. |
| "send it" / "publish" / "push it up" / "share for review" / "open a PR" | **Push** the branch and **open a PR** into the base branch; reply with the link. |
| "what's going on?" / "where are we?" | Show the current branch, what's changed, and any open PR — in plain words. |
| "undo that" / "go back" | Explain the safe options (revert the last commit vs. discard uncommitted edits) and **confirm before anything that deletes work**. |
| "clean up the repo" / "tidy the branches" / "remove old branches" / "prune merged branches" | **Prune the work branches already merged into the base** — both local and remote. Confirm which branch is the base first if you can't detect it. Only ever touch convention-named work branches (`feat/`, `fix/`, `chore/`, `docs/`, `content/`, `refactor/`) that are *fully merged*; **never** delete `main`, `master`, `dev`, `develop`, `stage`, `staging`, `stg`, or anything with unmerged work. |

When a request is ambiguous, pick the **safe** reading, do it, and say what you did in one
sentence — e.g. *"Saved your changes on a branch called `docs/pricing-update` and opened a
PR: <link>."*

## Steps the agent runs (exact commands in the reference)

1. **Before the first edit** — confirm a clean start, figure out the base branch, and cut a
   branch off the latest base.
2. **As work happens** — commit in small, clearly described chunks.
3. **When it's ready** — push and open a PR into the base branch; report the link and
   whether the automated checks pass.

Follow [`references/git-workflow.md`](references/git-workflow.md) end-to-end for the precise
commands, branch-naming, and recovery steps.

## Which branch is "the base"?

The base (shared) branch differs per repo — commonly `main`, sometimes `stage` / `staging`
or `develop`. **Detect it, don't assume.** Prefer the base branch named in
`agent/AGENTS.md` if it states one; otherwise read the repo's default branch (the reference
shows how). If it's still unclear, ask once in plain words — *"Which branch is the main /
shared one I should base this on — `main`?"* — then record the answer in `agent/AGENTS.md`
so nobody has to ask again.

## When something blocks you — explain it simply

Never drop a raw git error on a non-technical person. Say **what happened**, **what it
means**, and **the safe way forward** — then do the recommended option (or wait for a yes
when it could lose work). The common blockers:

| What happened (in plain words) | Say this, then… |
|---|---|
| **There are leftover changes from before** — the workspace wasn't clean when we started. | "I found some earlier unsaved changes. Want me to keep them on their own branch, or set them aside for now?" Don't sweep them into this work. |
| **We were on the shared branch** — about to edit the protected base. | "We were on the shared branch, so I moved your changes onto a new branch first — that keeps the project safe." (Just do it, then mention it.) |
| **Two people changed the same thing** (a merge conflict). | "Someone else changed some of the same lines. I'll show you both versions and we'll pick what's right — nothing is lost." |
| **The push was rejected** — your branch is behind the shared one. | "The shared branch moved on since we started. I'll merge the latest in — no force push needed." Use `git merge --ff-only origin/<base>`; if that fails, `git merge origin/<base>` (merge commit). **Never rebase** to fix this unless the user explicitly asks — rebase rewrites history and forces a push. |
| **The automated checks failed** (CI is red). | "The project's automatic checks didn't pass — here's what failed. Let's fix it before this gets merged." Show the failing output; never hide it. |
| **Not logged in / no permission** (e.g. `gh` not authenticated). | Give the exact one-line fix: "Run `gh auth login` once to connect GitHub, then I'll open the PR," and continue once it's done. |
| **The base branch isn't what we expected.** | Ask once which branch is the shared one, update `agent/AGENTS.md`, and continue with the corrected name. |

## Hard rules (never)

- **Never commit or push to the base branch directly** — branch first, always, even for a
  one-word fix.
- **Never open a PR into `main`** when the repo uses a separate integration branch (e.g.
  `stage`) — unless the user explicitly asks for a `stage → main` promotion.
- **Never force-push, `git reset --hard`, `git clean -fd`, or delete a branch** without
  explicit confirmation — these destroy work. (A "clean up the repo" request *is* that
  confirmation, but only for **fully merged** convention-named work branches — `feat/`,
  `fix/`, `chore/`, `docs/`, `content/`, `refactor/` — deleted with the safe `-d` flag. Never
  an unmerged branch, and never `main`, `master`, `dev`, `develop`, `stage`, `staging`, or
  `stg`.)
- **Never skip hooks** (`--no-verify`) and never amend an already-pushed commit on a shared
  branch.
- When in doubt, **stop and surface the problem in plain words** rather than guessing.

## References

| Topic | Reference |
|---|---|
| Exact commands — preflight, base-branch detection, branch / commit / push / PR, and recovery from each blocker | `references/git-workflow.md` |
