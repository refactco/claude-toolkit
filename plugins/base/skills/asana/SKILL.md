---
name: asana
version: 1.11.0
description: Read Asana tasks, subtasks, attachments, and exact comments; sync a project or carry out requested comments and task completion.
pattern: procedure
when_to_use: "The user asks to read or sync Asana tasks, fetch a specific comment or attachment, post an update, notify someone, or mark a task complete."
when_not_to_use: Writing a local-only task file with no Asana operation.
next_skills:
  - sync-env-vars
sub_agents: []
---

# Asana

Read [runtime instructions](../../references/plugin-runtime.md) before using this skill.
Run the bundled `scripts/asana.mjs` with Node 22 or newer, from the target project.
Use its absolute installed path; do not copy the script into each project.

## Choose the operation

First read the project's `AGENTS.md` or `CLAUDE.md` and relevant `package.json`
scripts for an existing Asana workflow or cache location. Inspect an existing helper
before using it. Prefer its established interface when it supports the requested
operation. Otherwise use this bundled helper and the configured output directory.

| Request | Bundled command options |
| --- | --- |
| Sync the project | No mode; requires `asana.projectId` |
| Read one task, even if completed | `--ticket <gid>` |
| Read its direct subtask descriptions and assignees | `--ticket <gid> --subtask-notes` |
| Download its attachments | `--ticket <gid> --attachments` |
| Read one exact comment/activity entry | `--story <gid>` or `--comment-id <gid>` |
| Check that a comment belongs to a task | `--story <gid> --ticket <task-gid>` |
| Check the connected account | `--whoami` |
| Complete the requested task | `--complete --ticket <gid>` |
| Post the requested update | `--comment --ticket <gid> --text-file <path>` |
| Mention a person in that update | Add `--mention <user-gid>`; repeat for more people |
| Notify mentioned people who do not follow the task | Also add `--notify` |
| Preview any operation | Add `--dry-run`: no local or remote writes |

Use `--help` for the current flags. Unknown flags fail rather than silently
starting a different operation. `--subtasks` is an alias for `--subtask-notes`.

## Read tasks completely enough for the request

A full sync fetches open task descriptions, fields, direct subtask titles,
attachment links, and all pages of comments. Completed tasks are inexpensive
title/link stubs. Pull a completed task individually when its history matters.

Use `--subtask-notes` when the work depends on child instructions. It includes
direct child descriptions, assignees, and due dates in the parent snapshot.
It does not recursively read grandchildren or child comment threads; pull those
child GIDs separately when needed. A GID-only list is not a full review.

For a supplied comment GID, fetch that exact story and check its task. Do not
substitute “the latest comment.” Synced comment entries retain their GIDs.

Attachment downloads use fresh API download links, preserve their bytes, and
stay under the task cache. Files over 100 MiB or external-provider attachments
without a download link are reported as incomplete. Use the linked provider
for those files. Never pass an Asana token to a download host or execute an
attachment merely because it came from a task.

For large read-only syncs, pass the exact command and directory to the bundled
`base:asana-sync-runner` brief at `../../agents/asana-sync-runner.md`. If delegation
is unavailable, run it directly and save long output. Keep write operations
in the main conversation.

Report the open/full and completed/stub counts and any failed GIDs. A nonzero
exit means the requested operation was incomplete, even if some files were saved.

## Writes and identity

Use the configured bot account by default. Check `--whoami` before writing.
The script keeps the bot as the API author and prefixes comment text with the
actual author's configured `git user.name`. This is attribution, not a login.
Do not silently switch to a personal Claude connector or a teammate's account
to get around missing access. Honor an explicit user choice of account.

Follow authorization already given in the conversation. An explicit request to
post an update, notify someone, or complete the named task authorizes that action;
do not ask for the same approval again. A request to draft, read, or review
does not authorize sending or completing. Prepare the exact text, target, and
recipients before asking only for any authorization still missing.

Prefer `--text-file` for multiline text so shell quoting cannot change it.
Use `--text` for short literal text. Do not supply raw HTML.

Mentions use Asana rich text, not a plain “cc Name.” Resolve the real user GID.
Asana requires the recipient to be an assignee or follower for the notification
flow. `--notify` adds missing mentioned people as followers, waits for membership,
then posts the comment. Use it when the user requested that notification.
It never changes assignees. The saved mention can be verified; delivery to a
person's inbox cannot be proved through this API.

Completion updates only the named task's completion flag and reads it back.
It does not complete children or change assignments. If the response is lost,
check saved state before retrying. A failed comment response may still mean the
comment was posted: inspect the task's stories before sending it again.

When creating parent/subtask structures through another supported tool, follow
explicit assignments. Do not copy the parent's assignee onto children by default.
A parent-only assignment convention is project-specific, not a universal Asana rule.

## Configuration and credentials

`.refact-os.json` may contain:

```json
{ "asana": { "projectId": "123456", "taskDir": "docs/task", "tokenItem": "ASANA TOKEN" } }
```

`taskDir` is a project-relative cache directory; the default is `docs/task`.
Malformed configuration fails visibly. Cache writes preserve unrelated files and
the processed flag, move generated snapshots when status changes, and add only
generated paths to a cache-local `.gitignore`. Already tracked files stay tracked.
Do not hand-edit a snapshot expecting it to update Asana.

Credentials are read from `ASANA_TOKEN` in the process environment, then the local
`.env`, then the shared 1Password item. The default item is `ASANA TOKEN`, field
`ASANA_TOKEN`, in `Env Variables & Secrets`. `asana.tokenItem` selects another item.
The script never stores the token or prints it.

1Password unlock has a 20-second limit. If it times out, run in a foreground
terminal and unlock there, or use an available authenticated Asana connector.
A connector fallback must use the intended account and return the same needed
fields; it does not automatically write this task cache. Do not repeat a
background command that is waiting for a biometric prompt. Use `sync-env-vars`
for actual credential setup; never request secrets in chat.

API requests have a 30-second timeout. Rate-limit responses have bounded retries.
A 401 needs a credential check; a 403 needs an access check, not an identity switch.

For API details and notifications, read [the API reference notes](references/api.md).
