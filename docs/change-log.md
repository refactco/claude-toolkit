# Change Log — refact-os plugin marketplace

This file is a running log of every change we make to this repo while we move the
Refact skills into the plugin marketplace. **Newest first.**

Plan: see `docs/plugin-marketplace-plan.md`.

---

## 2026-06-30 — Stage 2: built the 7-pack marketplace

Executed the build on branch `feat/marketplace-7-packs`.

- **Carved 7 plugins** under `plugins/`: `base`, `client`, `ops`, `seo`, `nextjs`, `wordpress`,
  `testing`; **removed** the old `plugins/dev-toolkit`.
- **30 skills placed**: brought 17 from refact-os (`templates/packs/*` + the TDD harness),
  updated 13 from dev-toolkit. Each `SKILL.md` was rewritten per the contract (no
  `agent/skills`/`refact:sync`/`refact:validate`/`.cursor`; bundled scripts repointed to
  `${CLAUDE_PLUGIN_ROOT}/skills/<name>/scripts/`; monorepo paths → detect/ask; working dirs
  created on demand). Helper scripts (`asana.mjs`, `sentry.mjs`, `sync-env.sh`, the
  `plugin-update` toolset, etc.) were copied into each skill's `scripts/`.
- **`/refact`** rebuilt as `plugins/base/commands/refact.md` (menu router).
- **Slim `.refact-os.json`**: `update-project-config` rewritten to write only
  `{ structure, stack }`; new `preflight-refact-config.mjs` hook warns when it is missing.
- **Hooks**: `base` = vtsls auto-install (SessionStart) + transcript→server (Stop/SessionEnd,
  with the project-root fix) + preflight (UserPromptSubmit); `wordpress` = intelephense
  (SessionStart). **LSP split**: TS/JS in `base`, PHP in `wordpress`.
- **Manifests**: `marketplace.json` registers all 7 (bumped to **v2.0.0**); each `plugin.json`
  carries `version: 1.0.0`. `CLAUDE.md` and a new top-level `README.md` rewritten for the
  7-pack layout + the plain-English response rule.
- **Verified**: 30 skills, every folder name == frontmatter `name`, all JSON valid, all
  `SKILL.md` + reference docs free of scaffold refs, both new hook scripts pass syntax checks,
  all 7 marketplace sources resolve. Known cosmetic leftover: bundled scripts keep some
  refact-os path strings in *comments / usage hints* (non-functional).

---

## 2026-06-30

### Re-triaged all 50 refact-os skills (v2.16.0) and rewrote the plan — 7-pack split
Read the current `@refactco/refact-os` (v2.16.0) and reconciled it against this repo.

- **Updated `docs/plugin-marketplace-plan.md`** to supersede the older 6-pack version. New
  result: **21 DROP, 1 REBUILD, 5 KEEP, 23 FIX → 28 surviving skills + the `/refact` command,
  across 7 packs** (`base`, `client`, `ops`, `seo`, `nextjs`, `wordpress`, `testing`).
- **Key decisions this round:** finer 7-pack split (was 6); keep `/refact` but rebuild it as a
  native `commands/refact.md` slash command; account for skills the old doc missed (TDD harness
  `tdd`/`tdd-plan`/`red-green-refactor`, `close-ticket`, `plugin-update`); and **drop the
  `docs/`-as-memory methodology skills** (`ingest-input`, `process-docs`, `open-ticket`,
  `close-ticket`, `update-canonical-record`, `project-status`, `import-chat-history`) plus
  `git-it`, `create-deliverable`, `render-deliverable` — keeping only `extract-learnings` and
  `draft-discovery-proposal` from that group. `project-context` folded into `base`.
- **Scope:** Stage 1 (the decision) only. No skills moved, no plugins carved, `marketplace.json`
  untouched. Stage 2 (build the 7 packs) and the Later wind-down of the npm package are deferred.

### Adjustments (same session) — counts now 19 DROP / 6 KEEP / 24 FIX → 30 survivors
- **Restored `render-deliverable`** → `client` pack (markdown → branded PDF still wanted).
- **Moved `asana` and `sync-env-vars` into `base`**; `ops` is now just `cloudflare` + `sentry`.
- **Kept `.refact-os.json`, slim** — canonical **project structure + tech stack** only, no
  secrets. **Restored `update-project-config`** (in `base`, rewritten slim) as its only writer;
  skills read it. Updated rewrite-contract item 4 accordingly (and dropped `.refact-os.json`
  from the Stage-2 forbidden grep). `setup-project` stays dropped.
- **Hooks:** bringing `claude-transcript-send-to-remote` (POST transcript to a server) and a
  Claude-Code **preflight `.refact-os.json` check** into `base`; the LSP auto-install hooks
  stay. Not bringing the local `copy-to-repo` transcript hook.
- Net pack sizes: base 6, client 3, ops 2, seo 5, nextjs 4, wordpress 5, testing 5.

---

## 2026-06-24

### Removed Group 1 skills (maintainer-only) from `dev-toolkit`
Deleted these four skill folders from `plugins/dev-toolkit/skills/`:

| Skill | Why removed |
|---|---|
| `release` | Cuts an npm release of the `@refactco/refact-os` package. Works only in the refact-os repo. |
| `write-update-note` | Writes a team note about refact-os releases. About refact-os itself. |
| `update-package` | Bumps/reinstalls the refact-os npm package. Needs that package in the project. |
| `contribute-skill` | Opens a pull request (a change request) to the refact-os repo's catalog. Upstream-only. |

- **Why:** these skills act on the refact-os product itself, not on a user's project. They should not ship in the plugin.
- **Result:** `dev-toolkit` went from 29 to 25 skills.
- **Scope:** Part 1 / Phase 1 of the plan. Version bump for the plugin will happen at the end of Phase 1, not now.

### Added this change log
- New file `docs/change-log.md` (this file) to track all repo changes from here on.

---

## 2026-06-23

### Added the migration plan
- New file `docs/plugin-marketplace-plan.md` — the two-part plan. Part 1: build the plugin marketplace now. Part 2: deprecate the `refact-os` npm tool later (deferred).
