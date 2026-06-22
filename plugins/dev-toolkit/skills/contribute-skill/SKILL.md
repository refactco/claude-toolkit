---
name: contribute-skill
description: Promote a portable, locally-authored skill into the shared refact-os catalog via a fork + pull request, so every engagement can get it. Never pushes to main.
pattern: procedure
when_to_use: A local skill in this repo is genuinely reusable across engagements (passes the local-vs-global rubric) and should ship in refact-os for others to get-skill. The user asks to "contribute/upstream/promote this skill".
when_not_to_use: The skill is bespoke to this repo or embeds company-private data (keep it local). For authoring a new skill (use create-skill) or pulling an existing pack (use get-skill).
next_skills: []
sub_agents: []
---

# Contribute Skill

Promote a **local** skill into the shared refact-os catalog so other repos can `get-skill`
it. This opens a **pull request** against `refactco/refact-os` — it never pushes to that
repo's `main`. A maintainer reviews and merges; it ships on the next `npm publish`.

## Step 1 — Confirm it's global

Re-check the local-vs-global rubric (it must pass **all**):

- **Process, not content** — reads project facts from `docs/`, doesn't bake them in.
- **Reusable across engagements** — at least two plausible projects would want it.
- **No company-private data** — no client names, secrets, or one-repo-specific context.
- **Stable** — not churning week to week.

If any fails, **stop** — it stays local. When unsure, keep it local; promotion is cheap later.

## Step 2 — Choose the target in refact-os

- Universal (any engagement) → `templates/base/agent/skills/<name>/`.
- Capability-specific (only with a stack/pack) → `templates/packs/<pack>/agent/skills/<name>/`.

If it's not obvious, ask the user which pack — or whether it warrants a new pack.

## Step 3 — Fork, branch, copy, PR (non-interactive `gh`)

The agent does this end-to-end with the ambient `gh` auth; **never push to `refactco/refact-os` `main`**.

```bash
# 1. Fork (no-op if it already exists), into a temp clone — never into this repo's tree.
DIR="$(mktemp -d -t refact-os-contrib.XXXXXX)"
gh repo fork refactco/refact-os --clone=false
git clone "https://github.com/$(gh api user --jq .login)/refact-os.git" "$DIR"

# 2. Branch.
git -C "$DIR" checkout -b "feat/skill-<name>"

# 3. Copy the skill folder from THIS repo into the chosen target in the fork.
mkdir -p "$DIR/templates/<base-or-pack-path>/agent/skills/<name>"
cp -R agent/skills/<name>/. "$DIR/templates/<base-or-pack-path>/agent/skills/<name>/"

# 4. Commit + push the branch to the fork.
git -C "$DIR" add -A
git -C "$DIR" commit -m "feat(skills): add <name> skill"
git -C "$DIR" push -u origin "feat/skill-<name>"

# 5. Open a PR from the fork against refactco/refact-os main.
git -C "$DIR" rm -rf . >/dev/null 2>&1; # (only inside the temp clone, never this repo)
gh pr create --repo refactco/refact-os --head "$(gh api user --jq .login):feat/skill-<name>" \
  --base main --title "feat(skills): add <name> skill" \
  --body "Promotes the <name> skill from a project into the catalog. Reusable per the local-vs-global rubric."
```

Notes:
- If the actor already has push access to `refactco/refact-os`, you may branch there directly instead
  of forking — but still open a PR; **never commit to `main`**.
- Make the skill *process, not content* before contributing — strip any project-specific values, and
  confirm its frontmatter declares the full resolver fields.
- Clean up the temp clone (`rm -rf "$DIR"`) when done. Never clone refact-os into this repo's tree.

## Step 4 — Report

Give the user the PR URL and a one-line summary. The skill stays in this repo too (contributing
doesn't remove it); once the PR merges and a new refact-os is published, other repos get it via
`get-skill` / `init`.

## Guardrails

- **Never** push to `refactco/refact-os` `main` or force-push there.
- **Never** contribute a skill that embeds client/company-private data.
- **Never** clone refact-os into this project's working tree — use a temp dir.
