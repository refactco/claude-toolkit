---
name: write-update-note
description: Draft a short, team-facing note about the latest refact-os updates — framed by what the reader does (not by version number), with a 3-line Slack cut alongside the full note.
pattern: procedure
when_to_use: The user asks for a report / note / summary of recent updates or releases to share with the team or consumers ("create an update note", "what changed for the team", "summarize the latest version").
when_not_to_use: Writing the CHANGELOG entry itself (that belongs to the release flow); a commit message; or deep technical release notes aimed at maintainers.
inputs:
  - CHANGELOG.md (the versions in scope); optionally recent git tags / PRs for context
outputs:
  - a team-facing update note (full markdown) plus a 3-line Slack cut
next_skills: []
sub_agents: []
---

# Write Update Note

Turn recent changes into a short note a teammate can act on. **Frame it by what the
reader does, not by version number** — version numbers are supporting detail, not
section headers.

## 1. Gather (don't invent)
Read the relevant `CHANGELOG.md` entries (the versions in scope); skim `git log` / tags
/ PRs only if you need context. Summarize what actually shipped — no speculation.

## 2. Frame by what the reader DOES
Organize around the reader's actions:

- **① Update** — the one command to get it (e.g. `npm i -D @refactco/refact-os@latest && npx refact-os init`).
- **② What's different now** — the *single most important* behavior change, in plain language. Lead with this; don't open with a feature list.
- **③ Do I need to change anything?** — the migration answer, usually "mostly no" + the specific exceptions (e.g. scripts using a removed flag).
- *(optional)* **Worth knowing** — a short list of new capabilities, only if genuinely useful.

## 3. Audience & voice
- Write for people who **use** the tool, not maintainers. Plain language; lead with the action.
- Skip internal jargon — PR numbers, file paths, commit hashes don't belong in a team note.
- One headline behaviour-change beats a feature dump.

## 4. Always offer two cuts
- **Full note** — the ①②③ markdown above.
- **3-line Slack version** — update command + the one big change + "existing repos: just update, nothing else to do."

## 5. Keep it short
A few lines per section. If it's getting long, you're listing features instead of telling people what to do — cut back to the action.
