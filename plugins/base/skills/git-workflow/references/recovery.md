# Git Workflow — recovery when a step blocks you

Read this when a git step fails or blocks. For each blocker: explain it to the person in plain words
(the "say this" part), then run the recovery. Never drop a raw git error on a non-technical person —
say **what happened**, **what it means**, and **the safe way forward**, then do the recommended
option (or wait for a yes when it could lose work).

| What happened (plain words) → say this | Recovery |
|---|---|
| **Leftover changes from before** — the tree wasn't clean. *"I found earlier changes and will keep this task in a separate worktree."* | Preserve the original checkout. Create an isolated worktree from the intended base and transfer only changes this task needs. This is also the unattended fallback. Ask only if ownership or required scope remains unclear. A targeted stash is an option only when that specific move is authorized; record its identity and restore it to the original checkout. |
| **We were on the shared branch** — about to edit base. *"I'll move this task onto a work branch before committing."* | If all edits belong to this task, create the work branch without discarding them. If work is mixed, isolate it in a worktree. Recheck immediately before committing. |
| **Two people changed the same lines** (a merge conflict). *"Someone else changed some of the same lines. I'll show you both versions and we'll pick what's right — nothing is lost."* | Show the conflicting files (`git status`), resolve hunk by hunk **with the user**, `git add` each, then continue. Never blind-pick a side. |
| **Push rejected — your branch is behind.** *"The shared branch moved on since we started. I'll merge the latest in — no force push needed."* | `git fetch origin` → `git merge --ff-only origin/<base>`. If that fails, `git merge origin/<base>` (merge commit) — still no force push. **Never rebase** to fix this unless the user explicitly asks; **never** `--force` / `--force-with-lease` without explicit permission. |
| **Automated checks failed** (CI is red). *"The project's automatic checks didn't pass — here's what failed. Let's fix it before this gets merged."* | Fetch the failing output (`gh run view --log-failed` or `gh pr checks`), surface it, fix the cause, commit, push. Don't merge red; never hide it. |
| **Not logged in / no permission** (`gh` not authenticated). | Give the exact one-line fix: *"Run `gh auth login` once to connect GitHub, then I'll open the PR,"* and continue once it's done. |
| **The GitHub CLI is missing.** | Use an available authorized GitHub connector, or provide the pushed branch's compare link. Install system software only within existing authorization; otherwise ask before that installation, without blocking the completed code work. |
| **The branch or staged changes changed before a commit.** | Do not commit. Inspect current branch and staged diff, preserve other work, and select or create the appropriate task branch. Never reset the shared branch or sweep another session's staged changes into the commit. Re-run the check before retrying. |
| **Base branch isn't what we expected.** | Re-run Step 1b (in [`happy-path.md`](happy-path.md)); ask once which branch is the shared one; record it in `AGENTS.md`; continue with the corrected name. |

## When to stop and ask

- The base branch isn't what you detected, or the repo uses an unfamiliar integration branch.
- Ownership is unclear and isolating the work does not resolve which changes the task needs.
- A diverged local base cannot be used without changing unrelated history. Leave
  it intact and use a worktree from the verified remote base where possible. Ask
  only if the task actually requires reconciling that local history.
- Proposed work goes beyond the user's authorized task.
- You're about to do anything destructive (`reset --hard`, `clean -fd`, branch deletion, force-push).
- The task seems to require committing to the base branch or `main` directly — there is almost always
  a better path.
