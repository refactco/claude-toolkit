# Plan — Refact skills as a Claude Code plugin marketplace

> This is a planning document for review. Nothing here is built yet.
> **Part 1** is the focus (do now). **Part 2** is deferred (do later).

## Context

Today the same skills live in **two** places:

1. **`refactco/refact-os`** — an npm scaffolder (a tool that sets up a project). It does three jobs: (a) lay a fixed folder layout (the *substrate* — `docs/`, `agent/`, `.refact-os.json`); (b) generate skill copies for **both Cursor and Claude Code** from one canonical `agent/skills/` folder; (c) ship capability *packs* (`code`, `client`, `wordpress`, `nextjs`, `seo`) on demand via `get-skill`.
2. **This repo** — a Claude Code plugin marketplace. It hand-copies 29 of those skills into `plugins/dev-toolkit/skills/`, and adds real new value a scaffolder can't: **LSP config** (`.lsp.json` — language-server settings) and **SessionStart hooks** that auto-install language servers.

The hand-copies are **already drifting** (going out of sync): the plugin ships `release` and `write-update-note` (refact-os maintainer-only skills) and `code-development` (a refact-os *pack* skill), and is **missing** `close-ticket` and `get-skill`.

## Decisions that drive this plan
- **Drop Cursor** — Claude Code only.
- **The plugin marketplace is canonical** (the single source of truth) — skills are authored here; no upstream to sync from.
- **Pack-aligned plugins** — `dev-toolkit` (base) + `code`, `wordpress`, `nextjs`, `seo`, `client`.
- **Retire the substrate** — ship only skills (plus LSP + hooks). No `docs/`+`agent/` standard, no `.refact-os.json`. Each skill creates any working folder it needs on demand.

## Two parts
- **Part 1 — Build the plugin marketplace (FOCUS — do now).** Make the marketplace usable on new projects.
- **Part 2 — Deprecate `refact-os` (LATER — not now).** This is deferred. Part 1 does **not** touch or break `refact-os`; it only **copies** skill content out of it.

---

# PART 1 — Plugin marketplace (NOW)

## Goal
A marketplace you can add to any new project and install per capability:
```
/plugin marketplace add <this repo>
/plugin install dev-toolkit@refact-os
/plugin install wordpress@refact-os      # was: get-skill wordpress
/plugin install seo@refact-os
```

## Target layout
```
refact-os  (marketplace — keep this name)
.claude-plugin/marketplace.json     ← lists every plugin below
plugins/
  dev-toolkit/   base move set + TS/JS LSP + auto-install hooks
  code/          code-development, add-codebase, backfill-tests, integration-tests
  wordpress/     wp-env, install-wp-skills, setup-kinsta-deploy, setup-wpengine-deploy (+ PHP LSP)
  nextjs/        setup-nextjs-app, nextjs-dev, setup-vercel-deploy, setup-netlify-deploy
  seo/           gsc, ga4, ahrefs, gtm, pagespeed (+ scripts/, references/)
  client/        create-deliverable, render-deliverable, draft-discovery-proposal, writing-client-updates
```
Each plugin: `.claude-plugin/plugin.json` + `skills/<name>/SKILL.md`. Optional: `commands/`, `agents/`, `.mcp.json`.

Why it is clean: Claude Code auto-discovers `skills/<name>/SKILL.md`, so there is **no build/generation step**. Each plugin stays under 25 skills, so no generated index file is needed. `get-skill <pack>` maps to `/plugin install <pack>@refact-os`.

## Skill disposition (the core work)
Source: **P** = current plugin; **R** = refact-os `templates/packs/`. (The drop reasons are about what belongs in a consumer plugin for new projects — they do **not** depend on Part 2.)

### → `dev-toolkit` (base)
| Skill | Src | Action |
|---|---|---|
| git-workflow | P | Keep (core gate). Strip `.cursor`/`agent/` paths. |
| git-it | P | Keep. |
| sync-env-vars | P | Keep (self-contained). |
| ingest-input | P | **Rewrite**: create `docs/sources/raw/` on demand. |
| open-ticket | P | **Rewrite**: create `docs/task/open/` on demand. |
| close-ticket | R | **Add** (missing today) + same rewrite. |
| update-canonical-record | P | **Rewrite**: no fixed path; detect/ask. |
| extract-learnings | P | **Rewrite**: drop the "promote to `agent/AGENTS.md`" step. |
| process-docs | P | **Rewrite**: operate on `docs/` if present, create on demand. |
| project-status | P | **Rewrite**: scan `docs/` if present (reuse `scripts/scan-status.mjs`). |
| import-chat-history | P | **Rewrite**: default output dir; no substrate. |
| list-skills | P | **Rewrite**: report installed plugins/skills, not `agent/skills/` + catalog. |
| cloudflare, asana, sentry | P | Keep here for now (broadly useful). `asana` must drop its `.refact-os.json` read. |
| LSP (`.lsp.json`) + `hooks/` | P | Keep TS/JS (vtsls) here; optionally move PHP (intelephense) to `wordpress`. |

### → `code`
code-development (P), add-codebase (R), backfill-tests (P), integration-tests (P). Keep existing `references/`+`assets/`.

### → `wordpress`
wp-env, install-wp-skills, setup-kinsta-deploy, setup-wpengine-deploy (R) + `wp-cli.yml.example`.

### → `nextjs`
setup-nextjs-app, nextjs-dev, setup-vercel-deploy, setup-netlify-deploy (R).

### → `seo`
gsc, ga4, ahrefs, gtm, pagespeed (R) — **move with their `scripts/*.mjs` and `references/`** (substantial; do not rewrite). Consider shipping the Ahrefs MCP server via `.mcp.json`.

### → `client`
create-deliverable (R), render-deliverable (P, reuse `render.mjs`), draft-discovery-proposal (P), writing-client-updates (P).

### Drop (not for consumer plugins)
| Skill | Why |
|---|---|
| release, write-update-note | Maintainer tooling for the refact-os npm package. |
| update-package | Bumps that npm package; irrelevant to a plugin project. |
| get-skill | Replaced by `/plugin install <pack>@refact-os`. |
| setup-project, update-project-config | Manage `.refact-os.json`, which the substrate-free model drops. |
| adopt | Brings a repo to the retired substrate standard. |
| refact (router) | Depends on `.refact-os.json` preflight + `agent/` paths + a Cursor hook. Drop, or rebuild as a native `commands/refact.md`. |
| contribute-skill, create-skill | Author into `agent/skills/` + `refact:sync`; meaningful only for maintainers of this marketplace, not consumers. |

## Cross-cutting rewrite contract (apply to EVERY skill that moves)
One repeated pattern, not per-file bespoke work:
1. Remove `agent/skills/<x>/SKILL.md` path references → refer to skills by name.
2. Remove `npm run refact:sync` / `refact:validate` → no adapters to regenerate.
3. Remove `.cursor/` references and any Cursor hook mention.
4. Remove `.refact-os.json` dependence → use an **env var** (e.g. `ASANA_PROJECT_ID`) or **ask-once-and-store** in a small skill-managed file — not a repo-wide standard.
5. **Create working dirs on demand** rather than assuming a scaffold laid them.
6. Fix `next_skills`/`sub_agents` to reference only skills in the **same** plugin; cross-plugin links must be optional.

Verification grep (must return nothing under `plugins/`):
```
grep -rlE "agent/skills|refact:sync|refact:validate|\.refact-os\.json|\.cursor" plugins/
```

## CLAUDE.md updates (this repo)
1. **Reverse the canonical-source note**: this repo is canonical; no `agent/` source, no `refact:sync`, multiple plugins.
2. **Add a plain-English response rule.** Exact text to add:
```markdown
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
```

## Marketplace mechanics & versioning
- Keep marketplace `name: "refact-os"` (npm name and marketplace name are different namespaces — no conflict).
- Per-plugin `version` in each `plugin.json` (none today — add it) and in `marketplace.json`. Bump the changed plugin + the marketplace version on every change.

## What to consider (plugin-native options the scaffolder never had)
- **Slash commands** (`commands/*.md`) and **sub-agents** (`agents/*.md`) — a cleaner home for the old `refact` router than a skill.
- **MCP servers** (`.mcp.json`) can ship inside a plugin — good fit for `seo` (Ahrefs) and `sentry`/`asana`.
- **No on-install file mutation** — substrate-dependent skills must self-create their dirs (contract item 5).
- **Cross-plugin dependencies** are the sharp edge — keep `next_skills` within-plugin or optional.

## Execution phases (Part 1)
- **Phase 1 — Make `dev-toolkit` correct.** Remove the drop skills; add `close-ticket`; apply the rewrite contract to all base skills; add `version` to `plugin.json`; keep LSP+hooks; update `CLAUDE.md` (incl. the plain-English rule) + `marketplace.json`. *Ship-ready on its own.*
- **Phase 2 — Carve the pack plugins.** Create `code/`, `wordpress/`, `nextjs/`, `seo/`, `client/`. Copy pack skills from refact-os `templates/packs/` (with `scripts/`/`references/`/`assets/`), apply the rewrite contract, register in `marketplace.json`, fix cross-plugin links.
- **Phase 3 — Docs & verification.** Top-level `README.md` (per-plugin install commands); run the verification below.

## Verification (Part 1)
1. **Static:** the grep returns nothing; each `skills/<name>` folder name equals its frontmatter `name`; no plugin > 25 skills; no `next_skills` points outside its own plugin (or it is optional).
2. **Load test on a fresh project:** `/plugin marketplace add "<repo path>"`, install each plugin, restart, confirm skills are selectable and the dropped skills are gone.
3. **LSP/hooks:** new session → the `check-*.sh` hooks run and the servers attach to a PHP and a TS file.
4. **Smoke each pack:** e.g. `open-ticket` creates `docs/task/open/...` from nothing; an `seo` script runs; `render-deliverable` renders a sample md.

---

# PART 2 — Deprecate `refact-os` (LATER — deferred, not now)

> Do **not** start this until Part 1 is proven on real projects. Listed here only so the end state is on record.

All three of refact-os's jobs are removed by Part 1, so the npm tool is wound down:
1. Stop shipping skills (the catalog now lives in the marketplace).
2. Final npm release = a deprecation notice pointing to the marketplace; then `npm deprecate @refactco/refact-os "..."`.
3. Archive the repo (or replace its README with a redirect).
4. Move `docs/agent-first-repo-best-practices.md` into this repo's `docs/` for design history.
5. `lib/`, `bin/`, `templates/`, `.cursor/`/`.claude/` generation all retire with the package. (`adapters.js` index logic is available to copy back only if a plugin ever exceeds 25 skills.)
