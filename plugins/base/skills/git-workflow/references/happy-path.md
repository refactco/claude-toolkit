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

If the tree contains unrelated changes, preserve them and use a separate worktree
from the intended base. This also works when no human is available. If this task
needs uncommitted work, inspect its diff and transfer only the required changes.
Ask only when ownership or required scope is still unclear; never discard or stash
the whole tree as an automatic recovery.

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

- `<ticket>` is the issue / Asana / Linear ID when one exists. Look in the request
  and project context. If this is a one-off change without a ticket, use a descriptive
  slug and omit the task reference. Do not invent or create a ticket to unblock Git.
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

**Immediately before every commit**, including a second commit in the same session:

1. Run `git rev-parse --abbrev-ref HEAD` and compare with the intended work branch
   and shared base. After a PR merge, the checkout may have moved to the base.
2. Inspect `git diff --cached` in full. Every staged hunk must belong to this task.
   Explicit paths alone are not proof: one file can contain mixed edits. Do not use
   `git commit -- <paths>` as an ownership check; it can include unstaged content
   from those files. Isolate mixed work before staging it.
3. Run the bundled check, then commit only if it succeeds. Replace `<skill-dir>`
   with the absolute directory of the loaded git-workflow skill. List each reviewed
   repository-relative file separately; do not pass directories or glob patterns.

   ```bash
   node <skill-dir>/scripts/check-state.mjs --branch <work-branch> --base <base> \
     --commit --staged-path src/example.ts --staged-path tests/example.test.ts &&
   git commit -m "fix(example): explain the change"
   ```

The check is silent on success and never changes Git state. It detects branch
changes and unexpected staged files; it cannot establish hunk ownership or stop
another process changing the checkout afterward. Use an isolated worktree when
other agents or tools may edit the same checkout. Repeat the checks after a
failed hook or any change to the branch or index. A matching branch needs no
additional user confirmation.

## Step 5 — Push

```bash
node <skill-dir>/scripts/check-state.mjs --branch <work-branch> --base <base> &&
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
- Refs asana#<gid>          <!-- or: Closes asana#<gid> — see "The task reference" below -->
- <link the ticket; explain the motivation if non-obvious>

## Test plan
- [ ] <how a reviewer can verify>
- [ ] <screenshots / Loom for visual or admin changes>

## Notes
- <migrations, follow-ups, anything reviewers should know>
```

### The task reference — include it whenever a ticket exists

The first `## Why` bullet is a **machine-readable pointer to the ticket**, not decoration. Refact
Control watches merged PRs and mirrors their state onto the ticket — moving it to In Progress,
commenting when it hits staging, closing it when the work lands. That reference is how a PR is
matched to its task; without one the PR falls back to the branch name, and if that has no
`<ticket>` segment either, the ticket silently stays out of date.

| Form | Meaning on merge to the base branch |
|---|---|
| `Refs asana#<gid>` | Link only — the task is updated and commented, never auto-closed |
| `Closes asana#<gid>` | This merge finishes the task — it is closed automatically |

- **Default to `Refs`.** Use `Closes` only when merging this PR genuinely completes the whole
  ticket — not when it is one of several PRs against it.
- `<gid>` is the numeric Asana task id (the long number in the task URL). Trackers other than
  Asana keep the same shape with their own prefix (`linear#`, `jira#`); Refact Control reads the
  `asana#` form.
- Deliberately **not** GitHub's `Closes #123` syntax — that would auto-close a GitHub *issue*.
- Keep `<ticket>` in the branch name too (Step 3). It is the fallback match when a PR body has no
  reference, so the two conventions back each other up.
- Genuinely no ticket (a one-off chore)? Omit the line rather than inventing a gid.

After opening: report the PR URL, and if CI fails, surface the failing job output — never silently
re-run or rewrite history to mask it.

Opening or preparing a PR is not permission to merge it. Follow authorization
already given for this task; do not ask again for the same approved merge, and do
not extend that approval to unrelated work or a different PR.

## Step 7 — Respond to review

- Push new commits to address feedback; don't squash or rebase a pushed branch without asking.
- When approved and merged, delete the local branch with `git branch -d <name>` (use `-d`, not
  `-D`, so git refuses if anything is unmerged).
