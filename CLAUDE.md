# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## How to write your responses

Always answer in plain, simple English at about A2 (basic / elementary) level. Easy to understand.

- Use short sentences. One idea per sentence.
- Use common, everyday words. Avoid jargon (special hard words) and idioms.
- Keep exact technical names, file names, commands, and code accurate — never simplify those.
- If a word must stay as its exact technical term, keep the word and put its meaning in
  parentheses right after it. Example: "Edit the manifest (the settings file) ...".
- Prefer a small, concrete example over an abstract explanation.
- Short headings, bullets, and small tables are fine.

This rule is about the prose you write for the reader. It does not change code, file names,
commands, or exact technical names.

## What this repository is

This is a **Claude Code plugin marketplace**, not an application. It has no build step, no
package manager, and no test runner. It ships declarative JSON manifests, markdown skills, a
slash command, and hooks that Claude Code loads at runtime. "Building" here means editing
these files and bumping versions.

It ships **7 plugins** ("skill packs"), so a project installs only the capabilities it needs.

## Layout

```
.claude-plugin/marketplace.json       # marketplace manifest — lists all 7 plugins
plugins/
  base/         git-workflow, code-development, extract-learnings, asana,
                sync-env-vars, update-project-config, setup-refact-control-mcp-server
                .claude-plugin/plugin.json   .lsp.json (TS/JS)
                commands/refact.md            # the /refact slash command (router)
                hooks/hooks.json + check-vtsls.sh (SessionStart, auto-install TS/JS LSP)
                         + claude-transcript-send-to-remote.py (Stop/SessionEnd)
                         + preflight-refact-config.mjs (UserPromptSubmit)
  client/       draft-discovery-proposal, writing-client-updates, render-deliverable
  ops/          cloudflare, sentry
  seo/          ahrefs, ga4, gsc, gtm, pagespeed
  nextjs/       setup-nextjs-app, nextjs-dev, setup-vercel-deploy, setup-netlify-deploy
  wordpress/    wp-env, install-wp-skills, plugin-update, setup-kinsta-deploy,
                setup-wpengine-deploy
                .lsp.json (PHP)  +  hooks/check-intelephense.sh (SessionStart)
  testing/      tdd, tdd-plan, red-green-refactor, backfill-tests, integration-tests
docs/plugin-marketplace-plan.md       # the full plan + the 50-skill triage decision
docs/change-log.md                    # running change log
```

Each plugin has its own `.claude-plugin/plugin.json` **with a `version` field**. Skills with
support files keep them in `references/`, `assets/`, `scripts/`, `workflows/` next to `SKILL.md`.

## How the pieces wire together

- **Marketplace → plugins**: `marketplace.json` lists each plugin and points at its
  `./plugins/<name>` folder via `source`. Adding a plugin means a new entry here plus a new
  folder under `plugins/`.
- **Skills**: Claude Code auto-discovers every `skills/<name>/SKILL.md`. The folder name must
  equal the `name:` in the frontmatter. Frontmatter fields in use: `name`, `description`,
  `pattern` (`procedure` | `orchestrator`), `when_to_use`, `when_not_to_use`, `next_skills`,
  `sub_agents`, and optionally `references`, `requires_approval`, `disable-model-invocation`.
  `next_skills` must reference only skills **in the same plugin** (cross-pack links are
  optional prose).
- **`/refact` is a slash command, not a skill**: `plugins/base/commands/refact.md` is a menu
  router. It maps a typed action (`/refact config`, `/refact sync asana`, `/refact wp-env`, …)
  to the skill that handles it, and tells the user to `/plugin install <pack>@refact-os` when
  that pack is not installed.
- **`.refact-os.json` (slim)**: an optional, non-secret project file holding only the
  canonical **project structure + tech stack**. Skills may **read** it; `update-project-config`
  (base) **writes** it; the `preflight-refact-config.mjs` hook **warns** when it is missing
  before a `/refact` action. Secrets never go here — they stay in env / 1Password.
- **Hooks**: `base/hooks/hooks.json` registers `check-vtsls.sh` on `SessionStart`,
  `preflight-refact-config.mjs` on `UserPromptSubmit`, and `claude-transcript-send-to-remote.py`
  on `Stop` + `SessionEnd` (POSTs the chat transcript to `REMOTE_API_URL`).
  `wordpress/hooks/hooks.json` registers `check-intelephense.sh` on `SessionStart`. All
  `check-*.sh` exit `0` even on failure so they never block a session.
- **LSP**: `base/.lsp.json` binds `vtsls` to TS/JS/JSX/MJS/CJS; `wordpress/.lsp.json` binds
  `intelephense` to PHP/`.phtml`.

## This marketplace is canonical (it is NOT synced from a scaffold)

The skills were **lifted out of the `@refactco/refact-os` npm scaffolder once and rewritten**
to stand alone here. This repo is now the **single source of truth** — there is no
`agent/skills/` source, no `npm run refact:sync` / `refact:validate`, no `.cursor` adapters,
and no on-install scaffold. To change a skill, edit its `SKILL.md` (and support files)
directly. A skill body may still **read a slim `.refact-os.json`** for the project's structure
and tech stack, but nothing regenerates anything.

See `docs/plugin-marketplace-plan.md` for the full design and the 50-skill triage decision
(which refact-os skills were kept, fixed, dropped, or rebuilt).

## Authoring or editing a skill

1. Keep the folder name and frontmatter `name:` identical.
2. `pattern: orchestrator` (e.g. `tdd`) routes to other skills via `next_skills`; `procedure`
   skills declare `next_skills: []` if terminal. `next_skills` must stay within the same plugin.
3. Put any counting/scanning/parsing in a script the skill invokes (e.g.
   `plugins/client/skills/render-deliverable/render.mjs`), not in prose. Reference a bundled
   script as `${CLAUDE_PLUGIN_ROOT}/skills/<name>/scripts/<file>`.
4. Do not reintroduce scaffold assumptions: no `agent/skills/` paths, no `refact:sync`, no
   `.cursor`. Read non-secret config from `.refact-os.json`; never expect secrets there.
5. After adding or removing a skill, bump the changed plugin's `version` (in both its
   `plugin.json` and `marketplace.json`) and the top-level marketplace `version`.

## Testing the marketplace locally

Add the marketplace from this checkout, then install whichever packs you want:

```
/plugin marketplace add /Users/masoudgolchin/Documents/Refact Projects/new-plugin
/plugin install base@refact-os
/plugin install wordpress@refact-os
/plugin install seo@refact-os
```

`.claude/settings.local.json` (git-ignored) enables packs for this working copy. After editing
a skill, hook, or manifest, restart the session so Claude Code re-reads it.
