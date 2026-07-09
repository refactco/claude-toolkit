# Git Workflow — recovery when a step blocks you

Read this when a git step fails or blocks. For each blocker: explain it to the person in plain words
(the "say this" part), then run the recovery. Never drop a raw git error on a non-technical person —
say **what happened**, **what it means**, and **the safe way forward**, then do the recommended
option (or wait for a yes when it could lose work).

| What happened (plain words) → say this | Recovery |
|---|---|
| **Leftover changes from before** — the tree wasn't clean. *"I found some earlier unsaved changes. Keep them on their own branch, or set them aside for now?"* | `git stash push -m "wip"` → branch → work → `git stash pop` onto the right branch. Confirm before discarding anything. Don't fold their work into your commit. |
| **We were on the shared branch** — about to edit base. *"We were on the shared branch, so I moved your changes onto a new branch first — that keeps the project safe."* (Just do it, then mention it.) | `git stash` → `git switch -c <branch>` → `git stash pop`. Now commit on the branch. |
| **Two people changed the same lines** (a merge conflict). *"Someone else changed some of the same lines. I'll show you both versions and we'll pick what's right — nothing is lost."* | Show the conflicting files (`git status`), resolve hunk by hunk **with the user**, `git add` each, then continue. Never blind-pick a side. |
| **Push rejected — your branch is behind.** *"The shared branch moved on since we started. I'll merge the latest in — no force push needed."* | `git fetch origin` → `git merge --ff-only origin/<base>`. If that fails, `git merge origin/<base>` (merge commit) — still no force push. **Never rebase** to fix this unless the user explicitly asks; **never** `--force` / `--force-with-lease` without explicit permission. |
| **Automated checks failed** (CI is red). *"The project's automatic checks didn't pass — here's what failed. Let's fix it before this gets merged."* | Fetch the failing output (`gh run view --log-failed` or `gh pr checks`), surface it, fix the cause, commit, push. Don't merge red; never hide it. |
| **Not logged in / no permission** (`gh` not authenticated). | Give the exact one-line fix: *"Run `gh auth login` once to connect GitHub, then I'll open the PR,"* and continue once it's done. |
| **Base branch isn't what we expected.** | Re-run Step 1b (in [`happy-path.md`](happy-path.md)); ask once which branch is the shared one; record it in `AGENTS.md`; continue with the corrected name. |

## When to stop and ask

- The base branch isn't what you detected, or the repo uses an unfamiliar integration branch.
- The working tree starts dirty with unrelated changes.
- Any pull / push / merge fails — including `git pull --ff-only` on the base. A **diverged base**
  means stop and ask; do not merge or rebase the base yourself.
- The scope grows beyond what the branch name implies.
- You're about to do anything destructive (`reset --hard`, `clean -fd`, branch deletion, force-push).
- The task seems to require committing to the base branch or `main` directly — there is almost always
  a better path.
