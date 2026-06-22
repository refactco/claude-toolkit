---
name: asana
description: Interact with Asana — sync open tickets into docs/task/, pull a single task, or post a comment/update to a task on behalf of the current user.
pattern: procedure
when_to_use: /asana — for all Asana operations: sync tickets, pull a single ticket, add a comment, or post an update to a task.
when_not_to_use: Opening a local ticket by hand (use open-ticket).
next_skills:
  - sync-env-vars
sub_agents: []
---

# Asana Skill Reference

Use this skill whenever the user invokes `/asana` or asks to:

- Sync all Asana tickets locally
- Pull or refresh a single task
- Post a comment or status update on an Asana task

---

## Reading: sync tickets

`agent/scripts/asana.mjs` calls the Asana REST API and mirrors the configured project locally. **Open tasks are loaded in full; completed tasks are mirrored as lightweight stubs.**

- Walks the project's task list once (open **and** completed), paginated 100 at a time.
- **Open tasks** → `docs/task/open/<gid>.md`: fetches full details, custom fields, subtasks, attachments, and the complete story/comments thread.
- **Completed tasks** → `docs/task/closed/<gid>.md`: writes a stub with just the task name and an Asana permalink — **no per-task API calls**, so a long completed history stays cheap to sync.
- If a task transitions open → completed (or back), its file is moved automatically.
- Full files preserve the existing `processed: true|false` header. Stubs are always `processed: true`.
- Files left by the legacy `docs/asana/` layout are migrated into `docs/task/` on the next sync.

## Writing: add a comment or update

Comments are posted to Asana using the bot token, so the author always appears as the bot account. To make it clear who actually wrote the message, the script **automatically prepends the git user's name** (from `git config user.name`) to every comment:

```
Masoud Golchin: <the message text>
```

This means you can post on behalf of whoever is logged into git without needing individual Asana tokens per user.

---

## Prerequisites

| Requirement | Where it lives | Failure mode |
|---|---|---|
| Asana project ID | `.refact-os.json` → `asana.projectId` | Missing → the `preflight-metadata` hook blocks and asks for it. Only required for full sync, not single-ticket or comment. |
| Asana personal access token | Resolved at runtime from the shared `ASANA TOKEN` item (field `ASANA_TOKEN`) in the `Env Variables & Secrets` vault via `op` — or a literal `ASANA_TOKEN` in `.env` | Can't be resolved → the script prints why; set up `op` access via the `sync-env-vars` skill. |

### Sourcing the token

The token is resolved **at runtime — it is never written to `.env` or to a project item.** `asana.mjs` resolves `ASANA_TOKEN` in this order:

1. A literal `ASANA_TOKEN` in the environment or `.env` (if one is set) wins.
2. Otherwise it reads the **`ASANA_TOKEN` field** of a shared 1Password item — by default the item titled **`ASANA TOKEN`** in the fixed `Env Variables & Secrets` vault — on demand via the `op` CLI.

To point at a differently-named item, set `asana.tokenItem` in `.refact-os.json`:

```json
{ "asana": { "projectId": "1209…", "tokenItem": "My Asana Token Item" } }
```

**Prerequisite: `op` must be installed and authenticated.** If the token can't be resolved, hand off to `sync-env-vars`. Never echo `ASANA_TOKEN` or `OP_SERVICE_ACCOUNT_TOKEN` into chat or a PR.

---

## How to invoke

```bash
# Sync the full project
npm run asana:sync

# Dry-run (show changes, write nothing)
npm run asana:sync:dry

# Pull a single task (always full detail, even if completed)
npm run asana:sync -- --ticket 1209712345678901

# Post a comment to a task (git user name is prepended automatically)
npm run asana:comment -- --ticket 1209712345678901 --text "Reviewed and approved."
```

Direct invocation (equivalent):

```bash
node agent/scripts/asana.mjs
node agent/scripts/asana.mjs --dry-run
node agent/scripts/asana.mjs --ticket 1209712345678901
node agent/scripts/asana.mjs --comment --ticket 1209712345678901 --text "Reviewed and approved."
```

`--ticket <gid>` does not require `asana.projectId` — only the token — so it works for ad-hoc fetches and comments before a project is fully configured.

---

## Workflow when the user invokes the skill

### Sync or pull a ticket

1. **Parse intent.** Is this a full sync, a single-ticket fetch, or a write operation?
2. **Ensure `op` access.** The token is resolved automatically from the shared 1Password item at runtime. If a prior run failed because `op` isn't set up, hand off to `sync-env-vars`, then retry. (A literal `ASANA_TOKEN` in `.env` skips `op` entirely.)
3. **For full sync**: confirm `asana.projectId` is set in `.refact-os.json`. If missing, tell the user and offer to update it.
4. **Run** via the appropriate npm command above. Stream its output.
5. **Report**: total tasks synced, open-full / completed-stub split, action tally (`created` / `updated` / `moved` / `unchanged` / `error`). If errors, list the failing GIDs and messages.
6. Remind that newly-fetched open tickets are `processed: false` — run `/refact process docs` to integrate them.

### Post a comment or update

1. **Confirm the task GID** — the user must supply it, or look it up from synced `docs/task/open/` files.
2. **Draft the text** — keep it concise and factual; do not embellish.
3. **Confirm with the user** before posting. Comments are permanent — Asana does not allow deleting them via the API.
4. **Run** `npm run asana:comment -- --ticket <gid> --text "<message>"`. The script prepends `<git user name>: ` automatically.
5. **Report** the posted comment GID and the task permalink back to the user.

---

## Markdown produced by sync

### Open task — `docs/task/open/<gid>.md` (full)

```yaml
---
source: asana
added-by: asana.mjs
processed: false
asana-gid: 1209712345678901
asana-permalink: https://app.asana.com/0/1209.../1209712345678901
asana-modified-at: 2026-05-09T10:23:00.000Z
asana-completed: false
---
```

Followed by task name, status header (assignee / due / start / section / tags / parent), notes, custom fields, subtasks, attachments, and the full comments/activity thread.

### Completed task — `docs/task/closed/<gid>.md` (stub)

Lightweight: title + link only, `processed: true`, no per-task API calls on full sync. Pull full detail on demand via `npm run asana:sync -- --ticket <gid>`.

---

## Guardrails

- **Comments are permanent.** Always confirm the text with the user before posting.
- Every comment posted by the script is prefixed with the git user's name. Never strip or override this prefix — it is the only attribution signal since the token is shared.
- **Never** edit a synced ticket file by hand expecting it to round-trip to Asana. The sync is one-way (Asana → local); local edits are overwritten on the next sync.
- **Never** commit `.env` or echo `ASANA_TOKEN` into chat or PR descriptions.
- If a fetch fails with `401`, the token is invalid — tell the user to regenerate it in the shared 1Password item. `403` means the token lacks access to that project.
- If the project has thousands of open tasks, the first sync may take a couple of minutes (completed tasks are cheap — stubbed without per-task calls).
