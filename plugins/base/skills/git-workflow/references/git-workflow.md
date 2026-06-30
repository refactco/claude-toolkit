# Git Workflow Reference

The exact commands behind the `git-workflow` skill. Read it once at the start of any change
that will be committed — code, docs, content, or a deliverable — and follow it end-to-end.
For code work, the `code-development` skill (in the `code` pack) layers a few extra checks
on top of this; everything about branching, committing, and PRs lives here.

> **Base branch:** the shared/integration branch is **detected, not assumed** (see Step 1b).
> This guide writes it as `<base>`. It is most often `main`; some repos use `stage` /
> `staging` or `develop`. Substitute the real name everywhere below.

## TL;DR

```
<base>  ──●──────────●────────●──   (shared branch — never commit directly)
             \         /\       /
              \       /  \     /
            feat/x      fix/y          (your work happens here)
```

1. Start from a clean working tree on an up-to-date `<base>`.
2. Cut a branch: `feat/…`, `fix/…`, `chore/…`, `docs/…`, or `content/…`.
3. Commit in small, clearly described chunks.
4. Push and open a PR **into `<base>`**.
5. Stop and surface CI failures / review feedback rather than forcing past them.

## Hard rules

1. **Never commit or push directly to the base branch** (or to `main`). If you find yourself
   on it with uncommitted changes, move them onto a feature branch first (see Recovery → "on
   the base branch").
2. **Never open a PR into `main`** unless the user explicitly asked for an integration→`main`
   promotion. The default PR target is `<base>`.
3. **Never force-push** (`--force`, `--force-with-lease`) without explicit permission. If a
   push is rejected, stop and surface it.
4. **Never `git reset --hard`, `git clean -fd`, or delete a branch** without confirming —
   these destroy work.
5. **Never skip hooks** (`--no-verify`, `--no-gpg-sign`). If a pre-commit hook fails, fix the
   cause and re-commit.
6. **Never amend a commit already pushed** to a shared branch — add a new commit instead.

## Step 1a — Preflight

```bash
git status                          # working tree should be clean
git rev-parse --abbrev-ref HEAD     # what branch am I on?
git remote -v                       # confirm origin exists
```

If the tree is dirty with **unrelated** changes, stop and ask how to proceed (keep on their
own branch / set aside / discard). Do not fold their in-progress work into your commit.

## Step 1b — Determine the base branch

Use the first that resolves:

1. The branch named in `AGENTS.md` (look for a "Branches & PRs" / base-branch note).
2. The remote's default branch:
   ```bash
   git remote show origin | sed -n 's/.*HEAD branch: //p'   # e.g. main
   # or, offline:
   git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null   # e.g. origin/main → main
   ```
3. If neither is conclusive, **ask once** ("Which branch is the shared one — `main`?") and
   record it in `AGENTS.md`.

## Step 2 — Sync the base

```bash
git fetch origin
git switch <base>
git pull --ff-only origin <base>
```

If `--ff-only` fails, the local base has diverged — stop and ask how to reconcile rather
than merging or rebasing on your own.

## Step 3 — Create the branch

### Naming

| Kind | Pattern | Example |
|---|---|---|
| New feature | `feat/<ticket>-<slug>` | `feat/ABC-123-testimonial-carousel` |
| Bug fix | `fix/<ticket>-<slug>` | `fix/ABC-456-checkout-total` |
| Maintenance, deps, tooling | `chore/<slug>` | `chore/upgrade-phpcs` |
| Docs | `docs/<slug>` | `docs/onboarding-guide` |
| Content / non-code edits | `content/<slug>` | `content/pricing-page-copy` |

Rules:

- `<ticket>` is the issue / Asana / Linear ID when one exists. If there's no ticket, ask
  before omitting it — sometimes one needs creating first.
- `<slug>` is lowercase kebab-case, ≤ 5 words, describing the change.
- **One branch per ticket / request, not per sub-feature.** Multiple deliverables for the
  same request belong on one branch. If new work is added to an in-progress task, keep
  building on the current branch; never cut an additional branch without confirming first.

```bash
git switch -c feat/<ticket>-<slug>
```

## Step 4 — Commit

### Message style: Conventional Commits

```
<type>(<scope>): <subject>

<optional body — the *why*, links to the ticket, anything non-obvious>
```

- **Types:** `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`, `build`, `ci`, `style`.
- **Subject:** imperative mood, no trailing period, ≤ 72 chars.
- **Scope:** short area name (e.g. `fix(checkout): …`). Omit if it doesn't fit.

For a **non-code change by a non-technical contributor**, a plain, clear subject is enough —
`docs: update pricing page copy` — don't block on perfect type/scope. The agent writes the
message; the contributor just describes what they changed.

### Hygiene

- Stage files explicitly (`git add path/to/file`) — avoid `git add -A` / `git add .` so
  secrets, generated files, and unrelated edits don't sneak in.
- Keep commits focused — one logical change per commit makes review and revert easier.

## Step 5 — Push

```bash
git push -u origin feat/<ticket>-<slug>
```

If the remote already has a branch with that name you didn't create, stop and ask.

## Step 6 — Open the PR

```bash
gh pr create --base <base> --head feat/<ticket>-<slug> \
  --title "<conventional-commit-style title>" \
  --body  "<see template below>"
```

PR body template:

```markdown
## Summary
- <1–3 bullets — what changed>

## Why
- <link the ticket; explain the motivation if non-obvious>

## Test plan
- [ ] <how a reviewer can verify>
- [ ] <screenshots / Loom for visual or admin changes>

## Notes
- <migrations, follow-ups, anything reviewers should know>
```

After opening: report the PR URL, and if CI fails, surface the failing job output — never
silently re-run or rewrite history to mask it.

## Step 7 — Respond to review

- Push new commits to address feedback; don't squash or rebase a pushed branch without
  asking.
- When approved and merged, delete the local branch with `git branch -d <name>` (use `-d`,
  not `-D`, so git refuses if anything is unmerged).

## Cleanup — pruning merged branches

When the user says "clean up the repo", "tidy the branches", "remove old branches", or
similar, prune the branches that are **already merged into the base** — locally and on the
remote. Two guardrails make this safe:

- **Only convention-named work branches are ever pruned** — `feat/`, `fix/`, `chore/`,
  `docs/`, `content/`, `refactor/`. The protected branches — `main`, `master`, `dev`,
  `develop`, `stage`, `staging`, `stg` — and anything without a work prefix are **never**
  touched, even if merged.
- **Only fully-merged branches** are deleted (via the safe `-d` flag), so no in-progress work
  is lost.

**First, know the base.** Run Step 1b to detect the base branch. If it's still unclear,
**ask once** — "Which branch is the main/shared one I should treat as the base — `main`?" —
before deleting anything. The whole operation hinges on comparing against the right base.

```bash
git fetch --prune origin            # refresh refs; drop remote-tracking refs that are gone
git switch <base>                   # never delete the branch you're standing on
git pull --ff-only origin <base>    # make sure "merged into base" reflects the latest base
```

### Local branches

```bash
# List local work branches (feat/fix/chore/docs/content/refactor) fully merged into the base.
# The positive prefix filter means protected branches (main, master, dev, develop, stage,
# staging, stg) and any unprefixed branch can never appear here.
git branch --merged <base> --format='%(refname:short)' \
  | grep -E '^(feat|fix|chore|docs|content|refactor)/'
```

Show the list to the user, then delete each with the **safe** flag — `git branch -d` refuses
any branch that isn't fully merged, so it can never drop unmerged work:

```bash
git branch -d <branch>              # repeat per branch; -d (never -D) is the safety net
```

### Remote branches

Deleting a remote branch affects everyone, so **list first and confirm** before pushing the
deletions.

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

Skip any branch with an **open PR** (`gh pr list --head <branch>` returns a result) unless the
user says otherwise — a merged-looking branch may still be awaiting review. When done, report
what was removed (and what was kept and why) in plain words.

## Recovery — when a step blocks you

Each row is the safe handling for a common blocker. Explain it to the user in plain words
(see the skill's "When something blocks you" table), then run the recovery.

| Blocker | Recovery |
|---|---|
| **Dirty tree at the start** (unrelated changes). | `git stash push -m "wip"` → branch → work → `git stash pop` onto the right branch. Confirm with the user before discarding anything. |
| **On the base branch with uncommitted work.** | `git stash` → `git switch -c <branch>` → `git stash pop`. Now commit on the branch. |
| **Merge conflict** on pull/merge. | Show the conflicting files (`git status`), resolve hunk by hunk with the user, `git add` each, then continue. Never blind-pick a side. |
| **Push rejected — branch behind.** | `git fetch origin` → `git merge --ff-only origin/<base>` (fast-forward if possible; no force push needed). If `--ff-only` fails, use `git merge origin/<base>` to create a merge commit — still no force push. **Never rebase** unless the user explicitly asks. Never `--force` without explicit permission. |
| **CI failing.** | Fetch the failing job output (`gh run view --log-failed` or `gh pr checks`), surface it, fix the cause, commit, push. Don't merge red. |
| **`gh` not authenticated / no permission.** | Tell the user to run `gh auth login` once; retry the PR after. |
| **Base branch wrong/unknown.** | Re-run Step 1b; ask once; record the answer in `AGENTS.md`. |

## When to stop and ask

- The base branch isn't what you detected, or the repo uses an unfamiliar integration branch.
- The working tree starts dirty with unrelated changes.
- Any pull / push / merge fails.
- The scope grows beyond what the branch name implies.
- You're about to do anything destructive (`reset --hard`, `clean -fd`, branch deletion,
  force-push).
- The task seems to require committing to the base branch or `main` directly — there is
  almost always a better path.
