---
name: code-development
description: Code-specific layer over the base git-workflow skill: it defers all git mechanics (branch/commit/PR) to git-workflow and adds the code-only gates — run tests/lint/build before pushing, keep CI green, conventional-commit scopes.
pattern: procedure
when_to_use: Any task that will result in committed product-code changes — "add a feature", "fix the bug", "refactor", "update the styling", "wire up the endpoint".
when_not_to_use: Non-code changes (docs, content, config, deliverables) — those just use git-workflow directly. Read-only questions, exploration, or chat/transcript processing (those go through /refact).
next_skills: []
sub_agents: []
---

# Code Development Skill

A thin layer over the base **`git-workflow`** skill, for changes to product code. All the
git — branching, commits, pushing, opening the PR, recovering from blockers — lives in
`git-workflow`. This skill only adds the parts that are specific to code.

## Protocol

For every code task, in order:

1. **Run the base git workflow first.** Follow `agent/skills/git-workflow/SKILL.md` (and its
   `references/git-workflow.md`) to preflight, branch off the base, and — at the end — push
   and open the PR. Do not edit committed files while still on the base branch.
2. **Do the code work** on the feature branch, in focused commits.
3. **Add the code-specific gates** below before you push.
4. **Open the PR** (via git-workflow) and report the URL + CI status.

## Code-specific gates (what this skill adds)

- **Run the project's checks locally before pushing.** Whatever the repo provides —
  tests, lint, type-check, build (`npm test` / `npm run lint` / `npm run build`, `composer
  test`, `phpcs`, etc.). **CI must be green before review** — never push code you haven't
  run the checks on, and never merge a red PR.
- **Conventional-commit scopes for code.** Use a module scope so history reads well:
  `feat(checkout): …`, `fix(blocks): …`, `refactor(api): …`. (The base reference covers the
  general commit format; this is the code convention on top.)
- **Stage files explicitly** (`git add path/to/file`) so generated build output, vendored
  files, and secrets never sneak into a commit.
- **One logical change per commit** — keep diffs reviewable and easy to revert.

## References

| Topic | Reference |
|---|---|
| All git mechanics (branch, commit, push, PR, recovery) | `agent/skills/git-workflow/references/git-workflow.md` |

Add code-specific references here as the project grows (testing conventions, code style,
deploy process, …). Each new reference becomes another gate this skill can route to.

## Hard rules

- Everything in `git-workflow`'s hard rules applies (never commit to the base branch, never
  force-push without permission, never skip hooks, confirm before anything destructive).
- **Never push code with failing or un-run checks.** Green CI is a precondition for review.
- A branch maps to the ticket, not each sub-feature. When the user adds work to an
  in-progress task, keep it on the current branch; never cut an additional branch without
  confirming first.
