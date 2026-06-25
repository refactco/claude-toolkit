# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is a **Claude Code plugin marketplace**, not an application. It has no build step, no
package manager, and no test runner. It ships declarative JSON manifests, markdown skills,
and bash hooks that Claude Code loads at runtime. "Building" here means editing these files
and bumping versions.

## Layout

```
.claude-plugin/marketplace.json      # marketplace manifest — lists the plugins it offers
plugins/dev-toolkit/                  # the single plugin in this marketplace
  .claude-plugin/plugin.json          # plugin manifest (name, description, author)
  .lsp.json                           # language-server config (PHP, TS/JS)
  hooks/hooks.json                    # SessionStart hooks registration
  hooks/check-intelephense.sh         # auto-installs the PHP/WordPress LSP via npm
  hooks/check-vtsls.sh                # auto-installs the TS/JS LSP via npm
  skills/<name>/SKILL.md              # 29 skills, one folder each
  skills/<name>/{references,assets,scripts,workflows}/  # optional per-skill support files
```

Two version fields must stay in lockstep when you change the plugin: the top-level
`version` and the per-plugin `version` in `marketplace.json`, plus the implied version in
the commit message. (`plugin.json` currently carries no version field.) The git history
shows the convention — e.g. "bump to v1.1.0" when skills were added.

## How the pieces wire together

- **Marketplace → plugin**: `marketplace.json` points at `./plugins/dev-toolkit` via the
  `source` field. Adding a second plugin means a new entry here plus a new folder under
  `plugins/`.
- **Skills**: Claude Code auto-discovers every `skills/<name>/SKILL.md`. The folder name
  must equal the `name:` in the frontmatter. Frontmatter fields in use: `name`,
  `description`, `pattern` (`procedure` | `orchestrator` | `review`), `when_to_use`,
  `when_not_to_use`, `next_skills`, `sub_agents`, and optionally `disable-model-invocation`.
- **`refact` skill is the router**: it is the only `orchestrator` and the only skill with
  `disable-model-invocation: true` (so it fires only on an explicit `/refact <action>`). It
  maps typed commands to other skills. Every routed skill is also independently selectable
  from its own `when_to_use`.
- **Hooks**: `hooks/hooks.json` registers both `check-*.sh` scripts on `SessionStart`. They
  use `${CLAUDE_PLUGIN_ROOT}` for paths and `npm install -g` to install missing language
  servers, exiting `0` even on failure so they never block a session.
- **LSP**: `.lsp.json` binds `intelephense` to PHP/`.phtml` and `vtsls` to TS/JS/JSX/MJS/CJS.

## Critical distinction: skills describe the *consumer's* repo, not this one

Most skill bodies reference a project layout that **does not exist in this repository** —
`agent/skills/`, `docs/`, `.refact-os.json`, `.cursor/`, and commands like
`npm run refact:sync` / `npm run refact:validate`. Those describe the workflow a skill runs
**inside an end-user's project** after the plugin is installed. They are not instructions
for this repo.

In this repo there is **no sync/validate/build step**. To change a skill, edit its
`SKILL.md` (and support files) directly. Do not look for `agent/` or `refact:sync` here.

The skills are vendored copies whose canonical source is the separate `@refactco/refact-os`
package (the `release` and `update-package` skills target that package, not this plugin).
Keep that in mind if a skill's behavior needs to match upstream.

## Authoring or editing a skill

1. Keep the folder name and frontmatter `name:` identical.
2. `pattern: orchestrator` requires at least one referenced skill in `next_skills` or
   `sub_agents`; `procedure`/`review` skills declare `next_skills: []` if terminal.
3. Put any counting/scanning/parsing in a script the skill invokes (see
   `skills/project-status/scripts/scan-status.mjs` and `skills/render-deliverable/render.mjs`,
   both plain Node `.mjs` files), rather than enumerating by hand in prose.
4. After adding or removing a skill, bump the versions in `marketplace.json`.

## Testing the plugin locally

Load this marketplace from a local checkout, then install the plugin:

```
/plugin marketplace add /Users/masoudgolchin/Documents/Refact Projects/new-plugin
/plugin install dev-toolkit@refact-os
```

`.claude/settings.local.json` (git-ignored) already enables `dev-toolkit@refact-os` for this
working copy. After editing a skill or hook, restart the session so Claude Code re-reads it.
