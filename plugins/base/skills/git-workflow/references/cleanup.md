# Git Workflow — prune merged branches

When the user says "clean up the repo", "tidy the branches", "remove old branches", or "prune merged
branches", delete the branches **already merged into the base** — locally and on the remote. Two
guardrails keep this safe (also stated as a hard rule in `SKILL.md`, which loads first):

- **Only convention-named work branches are ever pruned** — `feat/`, `fix/`, `chore/`, `docs/`,
  `content/`, `refactor/`. The protected branches — `main`, `master`, `dev`, `develop`, `stage`,
  `staging`, `stg` — and **any branch with no work prefix** are **never** touched, even if merged.
- **Only fully-merged branches** are deleted (via the safe `-d` flag), so no in-progress work is lost.

**First, know the base.** Run Step 1b in [`happy-path.md`](happy-path.md) to detect the base branch.
If it's still unclear, **ask once** — *"Which branch is the main/shared one I should treat as the
base — `main`?"* — before deleting anything. The whole operation hinges on comparing against the
right base.

```bash
git fetch --prune origin            # refresh refs; drop remote-tracking refs that are gone
git switch <base>                   # never delete the branch you're standing on
git pull --ff-only origin <base>    # make sure "merged into base" reflects the latest base
```

## Local branches

```bash
# List local work branches (feat/fix/chore/docs/content/refactor) fully merged into the base.
# The positive prefix filter means protected branches (main, master, dev, develop, stage,
# staging, stg) and any unprefixed branch can never appear here.
git branch --merged <base> --format='%(refname:short)' \
  | grep -E '^(feat|fix|chore|docs|content|refactor)/'
```

Show the list to the user, then delete each with the **safe** flag — `git branch -d` refuses any
branch that isn't fully merged, so it can never drop unmerged work:

```bash
git branch -d <branch>              # repeat per branch; -d (never -D) is the safety net
```

## Remote branches

Deleting a remote branch affects everyone, so **list first and confirm** before pushing the deletions.

```bash
# Remote work branches fully merged into the remote base (strip "origin/", same prefix filter).
git branch -r --merged origin/<base> --format='%(refname:short)' \
  | sed 's#^origin/##' \
  | grep -E '^(feat|fix|chore|docs|content|refactor)/'
```

After the user confirms the list:

```bash
git push origin --delete <branch>   # repeat per branch
```

Skip any branch with an **open PR** (`gh pr list --head <branch>` returns a result) unless the user
says otherwise — a merged-looking branch may still be awaiting review. When done, report what was
removed (and what was kept and why) in plain words.
