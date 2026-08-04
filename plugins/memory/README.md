# memory — workflows on the refact-memory mount

Skills for reading and writing agent memory (the [refact-memory](https://github.com/refactco/refact-memory) repo) through a repo's gitignored `memory/` symlink. The schema is refact-memory's `memory-model.md`; the working conventions are its `AGENTS.md`. This pack applies them.

## The two regimes

How to tell which one you are in:

- **Spawned/unattended run — the mount is READ-ONLY.** You are one **if `REFACT_MEMORY_READONLY` is set in your environment** (the VPS runner sets it; a PreToolUse hook enforces it). Never write, edit, or create files under `memory/`; never commit, push, clone, or fetch refact-memory. Durable learnings, decisions, and outcomes go into your run report / the intake propose→approve path. Every skill in this pack self-gates on this marker.
- **Human-gated local session — read/write through this pack's skills** (no marker set; a developer is present and reviewing). Writes follow the write rules: evidence immutable after capture, tracker append-only (`supersedes:` to correct), `last-verified:` bumped on every knowledge touch, commits under **your own git identity** as `context(<company>/<project>): …`, and every write ends `pull → commit → push` (mirroring the VPS executor's `write_and_push()` discipline) — never a silent local commit.
- If you are an agent and unsure whether you may write: **you may not.**

## The lifecycle rule of thumb

Durable record → the mount; live working state → the repo's `docs/`; need what happened, read the mount; need what the team is shaping this sprint, read the repo.

## Skills

| Skill | What it does |
|---|---|
| `ingest-input` | Save hand-delivered inbound material as evidence (verbatim, enveloped) |
| `process-docs` | Integrate unprocessed evidence into knowledge/tracker, flip `processed:` |
| `log-entry` | Dated tracker entry (decision, meeting, delivery, …) + the knowledge-archive move |
| `update-canonical-record` | Surgical, cited edit to `project.md` / the named knowledge spec |
| `open-ticket` | Ensure the Asana anchor exists; materialize the local `task/` cache |
| `close-ticket` | Outcome → tracker entry; complete the Asana task |
| `project-status` | Deterministic status scan of the mount (script) + judgment on top |

## The freshness hook

`hooks/refresh-memory-mount.mjs` runs on **SessionStart**: if the repo has a `memory` mount, it staleness-gates (default 4h, `REFACT_MEMORY_PULL_MAX_AGE_HOURS`) a `git pull --rebase --autostash` on the shared local refact-memory clone, and warns — never pushes — when the clone holds unpushed local commits. All repos on a machine share one clone, so the first session of the day freshens the mount for all of them. Exits silently when there is no mount or when `REFACT_MEMORY_READONLY` is set (spawned runs have their own ephemeral mounts). Every failure path is one line and exit 0 — it never blocks a session.

## Requirements

- The repo's `memory/` mount (run the repo's link script: `npm run link-memory` or `node scripts/link-memory.mjs` — see the First-run section in the repo's `AGENTS.md`).
- `open-ticket`/`close-ticket` need `.refact-os.json` → `asana.projectId` (if null, the skills say so and stop) and the `asana` skill (base pack) or an `ASANA_TOKEN`.
