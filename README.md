# Refact OS — Claude Code plugin marketplace

A Claude Code **plugin marketplace** that packages the Refact skills as **7 installable packs**.
Install only the capabilities a project needs; turn packs on or off independently.

## Install

Add the marketplace once, then install the packs you want:

```
/plugin marketplace add refactco/claude-toolkit
/plugin install base@refact-os
```

(Or add it from a local checkout: `/plugin marketplace add /path/to/this/repo`.)

## The packs

| Pack | Install | What you get |
|---|---|---|
| **base** | `/plugin install base@refact-os` | git workflow, code-dev gates, Asana, env-var sync, learnings capture, client updates, slim project config, Refact Control MCP setup, the `/refact` command, TS/JS language server |
| **client** | `/plugin install client@refact-os` | discovery-first proposals, branded print-ready PDF rendering |
| **ops** | `/plugin install ops@refact-os` | Cloudflare client-zone ops (WAF/DNS/cache/bots), Sentry backlog triage |
| **seo** | `/plugin install seo@refact-os` | Ahrefs, Google Analytics 4, Search Console, Tag Manager, PageSpeed/Core Web Vitals |
| **nextjs** | `/plugin install nextjs@refact-os` | create/adopt a Next.js app, run & diagnose it, Vercel/Netlify deploy setup |
| **wordpress** | `/plugin install wordpress@refact-os` | local `wp-env` stack, safe plugin updates with QA + rollback, Kinsta/WP Engine deploys, PHP language server |
| **testing** | `/plugin install testing@refact-os` | TDD harness (`tdd` → `tdd-plan` → `red-green-refactor`), WordPress characterization + integration tests |

Start with **base** — it carries the `/refact` menu command and the always-useful git / env /
project-config skills.

## Skills by pack

Every skill (the exact `skills/<name>/` folder), grouped by the pack that ships it. Claude Code
auto-discovers these by trigger; you don't call them by name.

| Pack | Skills |
|---|---|
| **base** | `asana`, `code-development`, `extract-learnings`, `git-workflow`, `setup-refact-control-mcp-server`, `sync-env-vars`, `update-project-config`, `writing-client-updates` — plus the `/refact` command |
| **client** | `draft-discovery-proposal`, `render-deliverable` |
| **ops** | `cloudflare`, `sentry` |
| **seo** | `ahrefs`, `ga4`, `gsc`, `gtm`, `pagespeed` |
| **nextjs** | `nextjs-dev`, `setup-nextjs-app`, `setup-vercel-deploy`, `setup-netlify-deploy` |
| **wordpress** | `wp-env`, `install-wp-skills`, `plugin-update`, `setup-kinsta-deploy`, `setup-wpengine-deploy` |
| **testing** | `tdd`, `tdd-plan`, `red-green-refactor`, `backfill-tests`, `integration-tests` |

## `.refact-os.json` (optional, slim)

Skills read an optional, non-secret project file holding only the **project structure** and
**tech stack**:

```jsonc
{
  "structure": { /* where code lives; app slots if a monorepo */ },
  "stack":     { /* languages, frameworks, hosting */ }
}
```

The base `update-project-config` skill writes it; run `/refact config` to create or update it.
**Secrets never go here** — they stay in your `.env` / 1Password.

## Language servers

`base` auto-installs the TS/JS server (`vtsls`); `wordpress` auto-installs the PHP server
(`intelephense`). Both install on `SessionStart` and never block a session if `npm` is missing.

## How it is built

No build step. Each pack is a folder of markdown skills (`skills/<name>/SKILL.md`) plus
manifests and hooks that Claude Code loads at runtime. See `CLAUDE.md` for the layout and
`docs/plugin-marketplace-plan.md` for the design and the full 50-skill triage decision.
