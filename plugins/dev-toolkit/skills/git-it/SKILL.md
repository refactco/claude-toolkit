---
name: git-it
description: Initialize the git repo, make the first commit, and create the GitHub remote.
pattern: procedure
requires_approval: true
when_to_use: /refact git it | set up the repo | create the remote | first commit | publish to GitHub.
when_not_to_use: Saving or committing changes on an existing repo (use git-workflow; product code adds code-development). This skill is only for first-time repo/remote creation.
next_skills: []
sub_agents: []
---

# Git It Reference

Use this reference when the user invokes `/refact git it` (or asks to "set up the repo", "create the remote", "make the first commit", "publish to GitHub").

## Goal

Get this project from "no git history" to "pushed to a fresh GitHub repo" with one guided flow:
1. Make sure `gh` is installed and authenticated.
2. Ask the user 4 short questions.
3. `git init` if needed, make the first commit if there isn't one, `gh repo create`, push.

## Step 1 — Prerequisites

### 1a. Check for the GitHub CLI

```bash
command -v gh
```

If it's missing, **detect the OS** and **show the right install command**, then **ask the user for permission** before running it. Never run install commands autonomously (especially anything with `sudo`).

| OS | Suggested install |
|---|---|
| macOS (Homebrew) | `brew install gh` |
| Debian / Ubuntu | follow https://cli.github.com/manual/installation (uses an apt repository, requires sudo) |
| Fedora / RHEL | `sudo dnf install gh` |
| Arch | `sudo pacman -S github-cli` |
| Windows (winget) | `winget install --id GitHub.cli` |

Detect OS with `uname -s` (Darwin / Linux) and, on Linux, `cat /etc/os-release` for the distro.

If the user declines or you can't auto-install, stop here and ask them to install `gh` and re-run `/refact git it`.

### 1b. Check authentication

```bash
gh auth status
```

If it reports "not logged in" or fails: stop and tell the user to run `gh auth login` themselves — it's an interactive OAuth flow you can't drive for them. Once they confirm they've logged in, continue.

## Step 2 — Ask the user 4 questions

Ask one at a time; accept the suggested default if the user just confirms.

### Q1: Project name

- **Default suggestion:** humanize the current directory name. e.g. `flower-shop` → "Flower Shop".
- Use this for the eventual repo description and the README's H1 if it still has `<TODO: project name>`.

### Q2: Slug (repo name on GitHub)

- **Default suggestion:** lowercase the project name, replace any non-alphanumeric run with a single `-`, strip leading/trailing `-`.
- The slug must be valid for GitHub (`^[a-zA-Z0-9._-]+$`). If it isn't, suggest a corrected one and re-ask.

### Q3: Visibility

- **Default: `private`.**
- Other valid choice: `public`.
- Don't offer `internal` unless the user specifically asks for it.

### Q4: Owner

Run:

```bash
gh api user/orgs --jq '.[].login'
```

- If the list is empty → owner is the authenticated user. Get it with `gh api user --jq '.login'`. No question needed; just confirm.
- If the list has one or more orgs → present `<user>, <org1>, <org2>, …` and ask which one. Default to the personal account.

## Step 3 — Execute

Run the steps below in order. Stop on the first error and surface it; do not retry destructively.

### 3a. Initialize git if needed

```bash
test -d .git || git init -b main
```

If `.git` already exists, leave the current branch alone.

### 3b. Ensure a first commit exists

Check:

```bash
git rev-parse --verify HEAD 2>/dev/null
```

If that fails (no commits yet):

```bash
git add -A
git commit -m "chore: initial commit (refact-os scaffold)"
```

If commits already exist, **do not** create a synthetic "initial" commit on top — just continue.

### 3c. Create the remote and push

```bash
gh repo create <owner>/<slug> --<visibility> --source=. --remote=origin --push --description "<humanized project name>"
```

- `<visibility>` is literally `--private` or `--public`.
- If a remote named `origin` already exists locally, do **not** overwrite it. Stop and ask the user.
- If `gh` reports the slug is taken on the chosen owner, surface the exact error and ask for a different slug. Do not invent a fallback name yourself.

### 3d. Report

Print:

- Remote URL: `gh repo view --json url --jq .url`
- First commit hash + subject: `git log -1 --format='%h %s'`
- Two suggested next steps: "invite collaborators with `gh repo edit --add-collaborator …`" and "set branch protection in the GitHub UI".

## Guardrails

- **Never** run `sudo` autonomously. Always ask permission first.
- **Never** force-push. If `git push` fails, stop and surface the error.
- **Never** overwrite an existing `origin` remote.
- **Never** commit `.env`, `*.pem`, `*.key`, or anything matched by `.gitignore`. The generated `.gitignore` covers these, but verify by inspecting `git status` before the first commit.
- **Never** invent the slug or organization on the user's behalf — always show the suggestion and let them confirm or override.
- If the working tree has nothing to commit AND no prior commits exist, stop and ask the user to add something first — `gh repo create --source=.` requires a non-empty initial commit.
