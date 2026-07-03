---
name: migrate-to-marketplace
description: Migrate a refact-os-scaffolded project onto the refact-os plugin marketplace — detect the scaffold, back up, remove the generated agent/ + .claude/.cursor trees, slim .refact-os.json, move the contract to root CLAUDE.md, and print the pack install commands. Dry-runs and asks before any change.
pattern: procedure
when_to_use: A repo was scaffolded by the @refactco/refact-os npm tool (it has agent/skills/, generated .claude//.cursor/ adapters, a fat .refact-os.json with a _scaffold block, and refact:* npm scripts) and you want to move it onto the installable plugin marketplace instead. Triggers — "migrate this scaffolded repo to the marketplace", "move this refact-os project onto the packs", "get this repo off agent/skills".
when_not_to_use: A brand-new/empty project (there is nothing to migrate — just install the packs). A repo already on the marketplace (no agent/ tree). Authoring or changing a skill (edit its SKILL.md in the marketplace repo).
next_skills: []
sub_agents: []
requires_approval: true
---

# Migrate to marketplace

Move a **refact-os-scaffolded** repo off the npm scaffolder and onto the **plugin marketplace**.
The old model bundled skills under `agent/skills/` with generated `.claude/` + `.cursor/` copies;
the new model installs skills as packs (`/plugin install <pack>@refact-os`). This skill does the
structural move — it does **not** touch product code, `docs/`, or secrets.

## Golden rules

1. **Dry-run first, then ask.** Never mutate before showing the plan and getting a yes.
2. **Back up before removing.** Everything deleted goes into a timestamped, git-ignored backup.
3. **Warn, don't delete.** Anything that needs human judgement (a drifted skill body, a capability
   with no pack, the contract rewrite) is flagged — never silently removed.
4. **Preserve** `docs/`, `apps/`, `.env`, `.github/`, `tools/`, product code, and all secrets. This
   skill never reads, moves, or writes a secret.

## Step 0 — Detect and plan (no writes)

Run the detector from the project root and read its JSON report:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/migrate-to-marketplace/scripts/detect-scaffold.mjs
```

(Use `--summary` for a human-readable version.) It reports: the scaffold markers found, which
packs this project needs (from its stack + local skills), how each `agent/skills/*` maps to a pack
(or is obsolete / has no replacement), the config-slim plan, the trees to remove, and what to
preserve.

- If `isScaffold` is **false**, stop — the repo is already migrated. Just print the `packsToInstall`
  install commands and any leftover warnings. Change nothing.
- Otherwise, present the report to the user and **get explicit approval** before Step 2. Call out
  loudly: any `skills.unknown` (review by hand), the `skills.noReplacement` list, and the `mcp`/
  `hooks` decisions below.

## Step 1 — Confirm the target and the packs

Confirm the marketplace is reachable and the base pack is installed. Decide the contract target
with the user: the canonical contract can live in root **`CLAUDE.md`** or **`AGENTS.md`** (default
`CLAUDE.md`; make the other a thin pointer to it).

## Step 2 — Back up (git branch + snapshot)

Create a work branch (e.g. `chore/migrate-to-marketplace`). Copy every to-be-removed tree into a
timestamped, git-ignored `.refact-os-backup/<date>/` (add `.refact-os-backup/` to `.gitignore`).
Tell the user to delete the backup only after they have verified the result.

## Step 3 — Drift check (warn, never delete)

For each `agent/skills/<name>` that maps to a pack, compare the local body against the stock pack
copy (the installed pack under `CLAUDE_PLUGIN_ROOT`). Known path rewrites (`agent/skills`→pack,
`.cursor`→`.claude`, `apps/wordpress`→detect) are expected and fine. **List, do not remove,** any
substantive local edit until the user confirms it is captured. Separately, list every
`skills.noReplacement` and `skills.unknown` skill so the user decides before those bodies are lost.

## Step 4 — Move the contract

Draft the root contract (`CLAUDE.md` by default) from `agent/AGENTS.md`. **Keep** the hard rules,
the `.refact-os.json` rule, any front-end/build tables, branches & PRs, and env-sync notes.
**Drop/rewrite** the scaffold-only parts: the "never edit `.cursor/.claude` — run `refact:sync`"
rule, the whole `refact:sync`/`validate`/`update` tooling section, and every `agent/skills/`
reference. Point the other of `CLAUDE.md`/`AGENTS.md` at it. **Present the draft for review — this
is judgement, not a mechanical copy.**

## Step 5 — Slim `.refact-os.json` (in place)

Delete **only** the `_about` and `_scaffold` keys, preserving key order and formatting (do not
reserialize the whole file if it has comments). **Keep everything else** — in particular `stack`,
`asana`, `sentry`, and `wpEnv`, which the pack skills read. Never delete the file.

## Step 6 — Clean `package.json`

Remove the `refact:*` / `asana:*` / `sentry:*` / `chats:*` scripts (they call the soon-deleted
`agent/scripts/`) and the `@refactco/refact-os` devDependency. **Keep** every other script and dep
(e.g. `@wordpress/env` + `wp:*` / `theme:*`). Before removing the dep, grep for a real
`require`/`import` of it (not just scripts); if any, stop and ask. Then **suggest** `npm install`
to prune the lockfile — do not run it automatically.

## Step 7 — Hooks: hand them to the base pack

The base pack owns the transcript **send-to-remote** hook. Strip the `hooks` block from
`.claude/settings.json` (keep the `permissions` allows) and delete `.claude/hooks/`. The
marketplace has **no save-to-repo hook**, so nothing writes transcripts into the repo — confirm the
user is fine with remote-only (or wants no transcript hook at all).

## Step 8 — Remove the generated trees (after backup)

Remove `agent/`, the generated `.claude/{skills,scripts,GENERATED.md}`, and the generated `.cursor/`
tree. **Keep** `.claude/settings.json`, `.claude/settings.local.json`, `.claude/logs/`. Note the git
tracking difference: `.claude/*` is usually tracked (use `git rm`), while `.cursor/**` is usually
git-ignored except `mcp.json` (plain `rm`). If the team still uses Cursor, keep `.cursor/mcp.json`.

## Step 9 — MCP: keep the real wiring, don't invent one

A `.cursor/mcp.json` server is **Cursor-only** — Claude Code never reads it. Check `~/.claude.json`
and `.claude/settings.local.json` for how MCP actually works (it is often a **claude.ai remote
integration**, not a repo file). Document the real setup in the contract. **Do not** auto-create a
repo `.mcp.json`; only add one if the user wants a committed, runnable stdio/HTTP server and
confirms the command.

## Step 10 — Register + enable the packs

Add the marketplace and enable the packs the detector recommends. Write the committed
`.claude/settings.json` (do not touch existing `permissions`):

```jsonc
{
  "extraKnownMarketplaces": { "refact-os": { "source": { "source": "github", "repo": "refactco/claude-toolkit" } } },
  "enabledPlugins": {
    "base@refact-os": true, "wordpress@refact-os": true, "ops@refact-os": true,
    "testing@refact-os": true, "client@refact-os": true,
    "nextjs@refact-os": false, "insights@refact-os": false
  }
}
```

Set the recommended packs `true` and the not-needed ones `false` (per the detector). Then print the
`/plugin install <pack>@refact-os` commands and tell the user to **restart** so skills/LSP/hooks
load. Also fix the README if it documents `refact:sync` / `agent/skills`.

## Step 11 — Repair docs/ internal links (opt-in)

Removing `agent/` leaves dead links inside `docs/` — e.g. `docs/index.md` (read-order and the
"Agent" row → `agent/AGENTS.md` / `agent/`) and `docs/context/learnings.md` (→
`agent/skills/extract-learnings/SKILL.md`). The detector's `docsLinksToRepair` lists them (it skips
`docs/sources/raw/` evidence so transcripts don't flood the list). With the user's OK, repoint:

- contract links (`agent/AGENTS.md`) → the root contract (`CLAUDE.md`)
- skill links (`agent/skills/<x>/SKILL.md`) → prose like "the `<x>` skill (from the `<pack>` pack)", dropping the file path

Repoint **dead links only**. Do **not** rewrite recorded history — a closed/adopt ticket's account
of what the scaffold once did stays as written. This step is opt-in; skip it if the user is not
ready to touch `docs/`.

## Step 12 — Verify

Confirm: no scaffold markers remain (`agent/skills/`, `.claude/GENERATED.md`, `refact:*` scripts,
the devDep all gone); `.refact-os.json` still parses and still has `stack` / `asana` / `sentry` /
`wpEnv`; `docs/`, `apps/`, `.env` are untouched (`git status`); the root contract exists with no
`agent/skills/` or `refact:sync` references; `npm install` is clean. Commit the branch / open a PR
only if the user asks.

## What this skill must NOT do automatically

- Rewrite the contract without human review (Step 4).
- Delete a **drifted** skill body, or any `noReplacement`/`unknown` skill, without confirmation.
- Run `npm install`, or remove the devDependency if code imports it (Step 6).
- Create or change any MCP server config on its own (Step 9).
- Rewrite `docs/` content or recorded tickets — only repoint dead `agent/` links, opt-in and reviewed (Step 11).
- Touch product code, `.env`, 1Password items, or any secret.
