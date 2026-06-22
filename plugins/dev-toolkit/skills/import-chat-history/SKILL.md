---
name: import-chat-history
description: Import the project's Claude Code / Cursor chat history into docs/sources/raw/agent-transcripts/.
pattern: procedure
when_to_use: /refact get chat history | import chats.
when_not_to_use: Saving brand-new inbound material (use ingest-input) — this is only for agent chat logs.
next_skills:
  - process-docs
sub_agents: []
---

# Chat History Reference

Backfill this project's agent chats into:

- `docs/sources/raw/agent-transcripts/`

Use this reference when handling requests such as `/refact get chat history` or `/refact import chats`.

> New **Claude Code** chats are mirrored here automatically by the
> `claude-transcript-copy-to-repo` hook (on every Stop/SessionEnd), and new
> **Cursor** chats by `transcript-copy-to-repo` (on stop). This script is for
> backfilling history that predates those hooks, and for one-off imports. It is
> local-only — nothing is sent to the remote server.

## Script

- `.claude/scripts/import-project-chat-history.py` (or `.cursor/scripts/…` — identical copies)

## Default behavior

With `--tool auto` (the default) the script imports from whichever sources exist
for this repo, auto-detecting both:

- Claude Code: `~/.claude/projects/<encoded-cwd>/*.jsonl` (full native transcripts;
  `<encoded-cwd>` is the absolute repo path with `/` and `.` replaced by `-`)
- Cursor: `~/.cursor/projects/<project-key>/agent-transcripts/*.jsonl`

## Usage

From project root:

```bash
npm run chats:import
# or:
python3 .claude/scripts/import-project-chat-history.py
```

Restrict to one tool:

```bash
python3 .claude/scripts/import-project-chat-history.py --tool claude
python3 .claude/scripts/import-project-chat-history.py --tool cursor
```

Dry run:

```bash
npm run chats:import:dry
# or:
python3 .claude/scripts/import-project-chat-history.py --dry-run
```

Custom source (overrides auto-detection):

```bash
python3 .claude/scripts/import-project-chat-history.py --source "/absolute/path/to/transcripts"
```

Custom owner for generated meta files:

```bash
python3 .claude/scripts/import-project-chat-history.py --owner "Owner Name"
```

## Optional environment variables

- `CLAUDE_PROJECT_TRANSCRIPTS_DIR`: override the Claude Code source directory.
- `CURSOR_PROJECT_TRANSCRIPTS_DIR`: override the Cursor source directory.
- `REFACT_CHAT_OWNER` / `CURSOR_CHAT_OWNER`: default owner for generated `.meta.json` files.

## What it imports

- Copies all `*.jsonl` chat transcript files from the detected source(s) to the destination.
- Updates files only when content changed (SHA-256 compare).
- Creates `<chat-id>.meta.json` when missing (includes `session_id`, `owner`, `tool`, and source info).
