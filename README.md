# Refact Toolkit — Claude Code and Codex

A **plugin marketplace** with **9 installable packs** and **42 shared skills** for Claude Code and Codex.
Install only the capabilities a project needs; turn packs on or off independently.

## Install in Codex

```bash
codex plugin marketplace add refactco/claude-toolkit
codex plugin add base@refact-os
```

Start a new Codex task. Ask “Use the Refact toolkit for this project,” or select
`refact-toolkit` from the skill picker. Add `--ref <branch>` to the marketplace
command when testing a release branch.

For a project that should not use a pack, merge this into its `.codex/config.toml`:

```toml
[plugins."base@refact-os"]
enabled = false
```

This requires a trusted project and a new task. Each pack has its own switch.
See [the Codex guide](docs/codex.md) for usage, updates, local development, and
[all nine disable settings](examples/codex/disable-refact.toml).

## Install in Claude Code

Add the marketplace once, then install the packs you want:

```
/plugin marketplace add refactco/claude-toolkit
/plugin install base@refact-os
```

(Or add it from a local checkout: `/plugin marketplace add /path/to/this/repo`.)

## Keeping Claude Code packs up to date

New versions land on `main`. To enable automatic updates, open `/plugin`, choose
**Marketplaces > refact-os > Enable auto-update**. New files load after
`/reload-plugins` or a later launch. With explicit versions, every release must
bump the changed pack version.

For manual updates, refresh the marketplace and update each installed pack you use.
Then reload the plugins or restart Claude Code.

**The easy way** (needs the **base** pack): run **`/base:refact update plugins`**. It refreshes the
catalog, updates every installed pack, and tells you when to restart. **`/base:refact install plugins`**
does the same for installing. Both run the base **`manage-plugins`** skill.

**By hand — two steps, then reload:**

```
/plugin marketplace update refact-os      # 1. refresh the catalog (learn the new versions)
/plugin update base@refact-os             # 2. bump each installed pack you use…
/plugin update wordpress@refact-os        #    …repeat for the packs you have installed
```

Then run `/reload-plugins` or restart Claude Code to load the new versions.

- `/plugin marketplace update refact-os` **alone** only refreshes the *catalog*; your installed packs
  stay on their old version until you run `/plugin update <pack>@refact-os` for each.
- Check installed vs. available versions any time with `/plugin` (menu) or `claude plugin list`.

## The packs

In Codex, install any pack with `codex plugin add <pack>@refact-os`.
The language servers and `/base:refact` command below apply to Claude Code.
Codex uses the `refact-toolkit` entry skill.

| Pack | Claude Code install | What you get |
|---|---|---|
| **base** | `/plugin install base@refact-os` | git workflow, code-dev gates, Asana, env-var sync, learnings capture, client updates, slim project config, Refact Control MCP setup, the `/base:refact` command, TS/JS language server |
| **client** | `/plugin install client@refact-os` | discovery-first proposals, branded print-ready PDF rendering |
| **ops** | `/plugin install ops@refact-os` | Cloudflare client-zone ops (WAF/DNS/cache/bots), Sentry backlog triage |
| **insights** | `/plugin install insights@refact-os` | Ahrefs (SEO), Google Analytics 4, Search Console, Tag Manager, PageSpeed/Core Web Vitals |
| **nextjs** | `/plugin install nextjs@refact-os` | create/adopt a Next.js app, run & diagnose it, Vercel/Netlify deploy setup |
| **wordpress** | `/plugin install wordpress@refact-os` | local `wp-env` stack, safe plugin updates with QA + rollback, Kinsta/WP Engine deploys, PHP language server |
| **testing** | `/plugin install testing@refact-os` | TDD harness (`tdd` → `tdd-plan` → `red-green-refactor`), WordPress characterization + integration tests |
| **migrate** | `/plugin install migrate@refact-os` | one-time move of a refact-os-scaffolded repo (`agent/skills`, `.cursor` adapters) onto these installable packs |
| **memory** | `/plugin install memory@refact-os` | evidence, project memory, ticket records, and status scans |

Start with **base** — it carries the `/base:refact` menu command and the always-useful git / env /
project-config skills.

## Skills by pack

Every skill (the exact `skills/<name>/` folder), grouped by the pack that ships it.
Both clients can use skills for relevant requests. You can also select a skill explicitly.

| Pack | Skills |
|---|---|
| **base** | `asana`, `code-development`, `extract-learnings`, `git-workflow`, `setup-refact-control-mcp-server`, `sync-env-vars`, `update-project-config`, `writing-client-updates`, `manage-plugins`, `verify-visual-change`, `refact-toolkit` — plus the `/base:refact` command |
| **client** | `draft-discovery-proposal`, `render-deliverable` |
| **ops** | `cloudflare`, `sentry` |
| **insights** | `ahrefs`, `ga4`, `gsc`, `gtm`, `pagespeed` |
| **nextjs** | `nextjs-dev`, `setup-nextjs-app`, `setup-vercel-deploy`, `setup-netlify-deploy` |
| **wordpress** | `wp-env`, `install-wp-skills`, `plugin-update`, `setup-kinsta-deploy`, `setup-wpengine-deploy` |
| **testing** | `tdd`, `tdd-plan`, `red-green-refactor`, `backfill-tests`, `integration-tests` |
| **migrate** | `migrate-to-marketplace` |
| **memory** | `ingest-input`, `process-docs`, `log-entry`, `open-ticket`, `close-ticket`, `project-status`, `update-canonical-record` |

## Enable or disable a Claude Code pack (per project)

Each pack turns on or off independently — per project, and per person.

**From the menu:**

```
/plugin                            # browse, enable, disable, uninstall
/plugin enable  wordpress@refact-os
/plugin disable wordpress@refact-os
```

**From settings** (saves the choice with the project). In `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "base@refact-os": true,
    "wordpress@refact-os": true,
    "insights@refact-os": false
  }
}
```

- `.claude/settings.json` — shared, committed: the team's choice.
- `.claude/settings.local.json` — personal, git-ignored: your own choice; it wins over the shared file.

## Claude Code hooks

Three packs declare Claude hooks in their Claude manifests. Codex uses the shared
skills without these automatic hooks. Memory skills prepare the mount explicitly
in Codex. The Claude hooks run when their pack is enabled:

| Pack | Runs on | What it does |
|---|---|---|
| **base** | `SessionStart` | install the TS/JS language server (`vtsls`) |
| **base** | `UserPromptSubmit` | warn if `.refact-os.json` is missing |
| **base** | `Stop`, `SessionEnd` | upload the session transcript to `REMOTE_API_URL` |
| **wordpress** | `SessionStart` | install the PHP language server (`intelephense`) |
| **memory** | `SessionStart` | refresh the local memory mount |

Claude Code has **no switch for a single plugin hook**. To control them:

- **Turn off a pack's hooks** → disable the whole pack (`/plugin disable base@refact-os`).
- **Turn off every hook** (yours and all plugins') → set `"disableAllHooks": true` in `.claude/settings.json`.
- **The transcript upload** → point it at your own server with the `REMOTE_API_URL` env var; to stop it entirely, disable `base` or use `disableAllHooks`.

Plugin hooks **merge** with your own `.claude/settings.json` hooks — both run; neither replaces the other.

## `.refact-os.json` (optional, slim)

Skills read an optional, non-secret project file holding only the **project structure** and
**tech stack**:

```jsonc
{
  "structure": { /* where code lives; app slots if a monorepo */ },
  "stack":     { /* languages, frameworks, hosting */ }
}
```

The base `update-project-config` skill writes it; run `/base:refact config` to create or update it.
**Secrets never go here** — they stay in your `.env` / 1Password.

## Claude Code language servers

`base` auto-installs the TS/JS server (`vtsls`); `wordpress` auto-installs the PHP server
(`intelephense`). Both install on `SessionStart` and never block a session if `npm` is missing.

## Development and releases

Edit skills and scripts once under `plugins/<pack>/`. Both clients use those
files. Claude loads `.claude-plugin/plugin.json`; Codex loads
`.codex-plugin/plugin.json`.

Bump the changed pack versions in their Claude manifests, then run:

```bash
node scripts/sync-codex.mjs
node scripts/sync-codex.mjs --check
python scripts/check-plugins.py
node --test tests/plugin-support.test.mjs
```

The Python check needs `requirements-dev.txt` in a development environment.
The sync script updates both catalog versions, Codex metadata, and shared runtime
notes. Commit the generated files. Users need no build step when installing.
See [AGENTS.md](AGENTS.md) for the source layout and [docs/codex.md](docs/codex.md)
for runtime differences.

Pilot check 3: found the right repository without being told its name.
