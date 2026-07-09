# Git Workflow — happy path

The exact commands for a normal change: preflight → branch → commit → push → PR. This file is the
**canonical source** for branch naming, commit format, and the PR template — the compact block in
`SKILL.md` is only a skeleton; when they differ, this file wins. For code work, the
`code-development` skill layers extra checks on top of this. When a step **blocks** you, switch to
[`recovery.md`](recovery.md); for pruning merged branches, see [`cleanup.md`](cleanup.md).

> **Base branch:** the shared/integration branch is **detected, not assumed** (Step 1b). This guide
> writes it as `<base>` — most often `main`, sometimes `stage` / `staging` or `develop`. Substitute
> the real name everywhere below.

## TL;DR

1. Start from a clean working tree on an up-to-date `<base>`.
2. Cut a branch: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `content/…`, or `refactor/…`.
3. Commit in small, clearly described chunks.
4. Push and open a PR **into `<base>`**.
5. Surface CI failures / review feedback rather than forcing past them.

## Step 1a — Preflight

```bash
git status                          # working tree should be clean
git rev-parse --abbrev-ref HEAD     # what branch am I on?
git remote -v                       # confirm origin exists
```

If the tree is dirty with **unrelated** changes, stop and ask how to proceed (keep on their own
branch / set aside / discard). Do not fold their in-progress work into your commit.

## Step 1b — Determine the base branch

Use the first that resolves:

1. The branch named in `AGENTS.md` (a "Branches & PRs" / base-branch note).
2. The remote's default branch:
   ```bash
   git remote show origin | sed -n 's/.*HEAD branch: //p'          # e.g. main
   git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null   # offline: origin/main → main
   ```
3. If neither is conclusive, **ask once** ("Which branch is the shared one — `main`?") and record
   it in `AGENTS.md`.

## Step 2 — Sync the base

```bash
git fetch origin
git switch <base>
git pull --ff-only origin <base>
```

If `--ff-only` fails, the local base has diverged — **stop and ask** how to reconcile rather than
merging or rebasing on your own.

## Step 3 — Create the branch

| Kind | Pattern | Example |
|---|---|---|
| New feature | `feat/<ticket>-<slug>` | `feat/ABC-123-testimonial-carousel` |
| Bug fix | `fix/<ticket>-<slug>` | `fix/ABC-456-checkout-total` |
| Maintenance, deps, tooling | `chore/<slug>` | `chore/upgrade-phpcs` |
| Docs | `docs/<slug>` | `docs/onboarding-guide` |
| Content / non-code edits | `content/<slug>` | `content/pricing-page-copy` |
| Refactor (no behaviour change) | `refactor/<slug>` | `refactor/split-git-skill` |

- `<ticket>` is the issue / Asana / Linear ID when one exists. If there's no ticket, ask before
  omitting it — sometimes one needs creating first.
- `<slug>` is lowercase kebab-case, ≤ 5 words, describing the change.
- **One branch per ticket / request, not per sub-feature.** Multiple deliverables for the same
  request belong on one branch. New work added to an in-progress task stays on the current branch;
  never cut an additional branch without confirming first.

```bash
git switch -c feat/<ticket>-<slug>
```

## Step 4 — Commit (Conventional Commits)

```
<type>(<scope>): <subject>

<optional body — the *why*, links to the ticket, anything non-obvious>
```

- **Types:** `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`, `build`, `ci`, `style`.
- **Subject:** imperative mood, no trailing period, ≤ 72 chars.
- **Scope:** short area name (e.g. `fix(checkout): …`). Omit if it doesn't fit.

For a **non-code change by a non-technical contributor**, a plain, clear subject is enough —
`docs: update pricing page copy` — don't block on perfect type/scope. The agent writes the message;
the contributor just describes what they changed.

**Hygiene:**

- Stage files explicitly (`git add path/to/file`) — avoid `git add -A` / `git add .` so secrets,
  generated files, and unrelated edits don't sneak in.
- Keep commits focused — one logical change per commit makes review and revert easier.
- If a pre-commit hook fails, **fix the cause and re-commit** — never bypass it with `--no-verify`
  or `--no-gpg-sign`.

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

After opening: report the PR URL, and if CI fails, surface the failing job output — never silently
re-run or rewrite history to mask it.

## Step 7 — Respond to review

- Push new commits to address feedback; don't squash or rebase a pushed branch without asking.
- When approved and merged, delete the local branch with `git branch -d <name>` (use `-d`, not
  `-D`, so git refuses if anything is unmerged).
