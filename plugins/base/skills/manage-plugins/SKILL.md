---
name: manage-plugins
description: "Install or update the refact-os marketplace packs — all of them, the ones this project needs, or a single named pack. Refreshes the catalog, then installs/updates via the claude plugin CLI and reminds you to restart. This is about the /refact toolkit packs, not a WordPress site's plugins."
pattern: procedure
when_to_use: "The user wants to install or update the refact-os marketplace packs (the /refact toolkit) — \"install the plugins\", \"update the plugins\", \"/refact install plugins\", \"/refact update plugins\", \"get the latest packs\", \"am I on the latest refact-os packs\", or install/update a single named pack (\"install wordpress\", \"update the base pack\")."
when_not_to_use: "Updating a WordPress SITE's plugins (ACF, Yoast, …) — use the wordpress plugin-update skill / /plugin-update. Migrating a scaffolded repo onto the marketplace — use migrate-to-marketplace. Only turning a pack on/off for this project — edit .claude/settings.json enabledPlugins (no install needed)."
next_skills: []
sub_agents: []
---

# Manage plugins (refact-os packs)

Install or update the **refact-os marketplace packs** — `base`, `wordpress`, `ops`, `insights`,
`nextjs`, `client`, `testing`, `migrate`. These are Claude Code plugins from the `refact-os`
marketplace, **not** a WordPress site's plugins (for those, use the wordpress `plugin-update` skill).

> **Am I the right skill?** This manages **refact-os marketplace packs** (Claude Code plugins:
> `base`, `wordpress`, `ops`, …). If the user means a **WordPress site's plugins** (ACF, Yoast,
> anything under `wp-content/plugins/`), stop — that is the wordpress **`plugin-update`** skill
> (`/plugin-update`). `/refact update plugins`, `@refact-os`, or any pack name (`base`, `insights`,
> …) always means **this** skill. A bare "update the plugins" / "plugin update" on a WordPress
> project is ambiguous — **ask which they mean before doing anything.**

Two facts this skill exists to handle:
1. `claude plugin marketplace update` only refreshes the **catalog** — it does **not** upgrade packs
   you already have installed. You must also run `claude plugin update <pack>` per pack.
2. Every install/update needs a **restart** (or `/reload-plugins`) to take effect.

The marketplace name is `refact-os`. Run the `claude` CLI from a normal shell.

## Step 1 — Refresh the catalog

```
claude plugin marketplace update refact-os
```

(If the marketplace isn't added yet: `claude plugin marketplace add refactco/claude-toolkit`.)

## Step 2 — Read the plan (no changes)

```
node ${CLAUDE_PLUGIN_ROOT}/skills/manage-plugins/scripts/plugin-plan.mjs --summary
```

It prints: what's **installed** (+ versions, and `[disabled]`), what's **available**, what's **TO
UPDATE** (installed but behind the catalog), and what's **NOT INSTALLED**. Add pack names to scope
it (e.g. `… plugin-plan.mjs --summary wordpress`); drop `--summary` for JSON.

## Step 3 — Do what was asked

**Update everything** ("update the plugins"): for each pack in the plan's `toUpdate`, run
```
claude plugin update <pack>@refact-os
```
If `toUpdate` is empty, say "already on the latest" and stop.

**Update one pack** ("update the base pack"): `claude plugin update <pack>@refact-os`.

**Install one pack** ("install wordpress"): `claude plugin install <pack>@refact-os` (see Notes
for `--scope`).

**Install "the plugins"** (no pack named): don't blindly install all — recommend a set:
- `base` — always.
- `wordpress` if the repo is WordPress (`.wp-env.json`, `stack.wordpress`, a `wp-content/` tree).
- `nextjs` if it's a Next.js app (`next.config.*`, `stack.nextjs`).
- `ops`, `client`, `testing`, `insights` — offer them; install the ones the user confirms.
Then install each with `claude plugin install <pack>@refact-os`. If the user explicitly says
"install all", install every pack in the plan's `available` list.

## Step 4 — Restart to apply

Every `install` / `update` prints "Restart to apply changes." Tell the user to **restart Claude
Code** (or run `/reload-plugins`) — the new versions/skills do not load until then. Then re-run the
plan (Step 2) to confirm `toUpdate` and `NOT INSTALLED` are empty.

## Notes

- **Enable vs install are different.** Installing downloads a pack; enabling decides whether it
  loads for a project. To turn a pack on/off without reinstalling, edit `enabledPlugins` in
  `.claude/settings.json` (team) or `.claude/settings.local.json` (personal) — no CLI needed.
- **Scope:** `--scope user` (default) installs for all your projects; `--scope project` writes the
  enablement into the repo's committed `.claude/settings.json` so teammates get it.
- This skill never uninstalls or disables a pack unless the user explicitly asks.
