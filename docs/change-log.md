# Change Log — refact-os plugin marketplace

This file is a running log of every change we make to this repo while we move the
Refact skills into the plugin marketplace. **Newest first.**

Plan: see `docs/plugin-marketplace-plan.md`.

---

## 2026-07-02 — Removed stray `context-boundary-spec.md`

A top-level design note on where project context lives (repo vs Refact Control). It was
**unreferenced** by any skill, hook, or manifest and is not about the marketplace itself — it
rode in with the initial 7-pack restructure commit (`b72a730`) by accident. Removed to keep the
repo scoped to the marketplace. Recoverable from git history if it needs a home elsewhere.

---

## 2026-07-02 — Renamed the `analytics` pack → `insights` (final name)

Second rename in the same session — `analytics` was also judged not right (GTM is tag
management, not analytics; Ahrefs is SEO). `insights` names the pack's *purpose* — "how is the
site doing?" — and matches two of its tools' own product names (**PageSpeed Insights**,
**Search Console Insights**), so no single wrong category is implied.

- **`git mv`** `plugins/analytics/` → `plugins/insights/` — all 5 skills unchanged.
- **`plugin.json`** name → `insights`; description rewritten to name each tool's real category
  ("Site insights: SEO (Ahrefs, Search Console), web analytics (GA4), tag management (GTM),
  and PageSpeed/Core Web Vitals"); keywords gain `insights`, `analytics`. Same in
  **`marketplace.json`** (+ `source: ./plugins/insights`). Pack version stays `1.0.0`;
  top-level marketplace **2.3.0 → 2.4.0**.
- **Docs:** `README.md` (both tables) and `CLAUDE.md` (layout + install example) now say
  `insights`. Install: `/plugin install insights@refact-os`.
- Naming trail this session: `seo` → `analytics` → **`insights`** (rejected along the way:
  `marketing`, `measurement`, `seo-analytics`).

---

## 2026-07-02 — Renamed the `seo` pack → `analytics`

`seo` undersold the pack: it also holds GA4 (web analytics), GTM (tag management), and
PageSpeed (performance) — GTM in particular is not SEO. Renamed the pack so its scope is
honest, while keeping "SEO & analytics" in the description and `seo` in its keywords (the pack
still does SEO, and the keyword aids discovery).

- **`git mv`** `plugins/seo/` → `plugins/analytics/` — all 5 skills unchanged (`ahrefs`, `ga4`,
  `gsc`, `gtm`, `pagespeed`).
- **`plugin.json`** name `seo` → `analytics`; **`marketplace.json`** entry name + `source`
  (`./plugins/analytics`). Pack version stays `1.0.0` (content unchanged); top-level marketplace
  **2.2.0 → 2.3.0**.
- **Docs:** `README.md` (packs table + skills-by-pack) and `CLAUDE.md` (layout + local-install
  example) now say `analytics`. The install command is now `analytics@refact-os`.
- **Breaking for consumers:** anyone who installed `seo@refact-os` re-installs as
  `analytics@refact-os`. Cheap now — the marketplace is still on the `feat/marketplace-7-packs`
  branch and not merged to `main`.
- The `SEO` *word* elsewhere (Lighthouse category, WordPress SEO-plugin handling, Cloudflare
  bot rules) is the concept, not the pack — left untouched. Historical planning doc
  (`docs/plugin-marketplace-plan.md`) left as a point-in-time record.

---

## 2026-07-02 — Moved `writing-client-updates` from `client` → `base`

The client-update skill is generally useful on any engagement (status notes, issue
resolutions), not only on client-deliverable work, so it now lives in the always-available
**base** pack.

- **`git mv`** `plugins/client/skills/writing-client-updates/` → `plugins/base/skills/`
  (moved `SKILL.md` + `references/writing-client-updates.md`; skill unchanged).
- **No cross-links broke:** the skill has `next_skills: []`; the only reference to it is prose
  in `ops/sentry` ("see `writing-client-updates`"), which still resolves (and now points at a
  base-pack skill).
- **Manifests:** `base` 1.1.0 → **1.2.0** and `client` 1.0.0 → **1.1.0** (both `plugin.json` +
  `marketplace.json`); top-level marketplace **2.1.0 → 2.2.0**. Descriptions/keywords updated:
  base gains "client updates", client drops it. `CLAUDE.md` layout updated.

---

## 2026-07-02 — Synced upstream refact-os changes (v2.16.0 → v2.17.1)

Read the current `@refactco/refact-os` (fast-forwarded its local checkout to **v2.17.1**) and
brought the two post-lift changes into this marketplace. The lift baseline was v2.16.0, so the
`templates/` diff `v2.16.0..v2.17.1` is the complete "what changed upstream" set — only two
consumer-facing skills were touched.

- **Added new skill `setup-refact-control-mcp-server`** → **base** pack. Wires the private
  `@refactco/refact-control-mcp-server` (GitHub Packages) into a project's Claude Code via a
  self-contained `.mcp.json` entry, pulling both secrets from 1Password. Copied verbatim from
  upstream — it was already standalone-clean (no `agent/skills`, `refact:sync`, or `.cursor`).
  Registered it in the `/refact` router (menu + routing table + "always available" list).
- **Updated `backfill-tests`** (**testing** pack) to the v2.17.1 refresh: regenerated `SKILL.md`
  from upstream and re-applied this repo's only customization — the `apps/wordpress` → `<wp-app>`
  path abstraction (13 subs + the "locate the WordPress app directory" detection paragraph).
  Copied the refreshed `references/characterization-tests.md` and `assets/coverage-ledger-template.md`
  verbatim, and added the **new `references/coverage-deepening.md`** reference (linked from step 8).
  `assets/generated-test-template.php` was untouched upstream, so left as-is.
- **Version bumps:** `base` 1.0.0 → **1.1.0**, `testing` 1.0.0 → **1.1.0** (both in `plugin.json`
  and `marketplace.json`); top-level marketplace **2.0.0 → 2.1.0**. `CLAUDE.md` layout updated.
- **Not synced (intentional):** everything else upstream since the lift was maintainer-only or
  already-dropped per the 7-pack triage (`docs/plugin-marketplace-plan.md`). No hook, LSP, or
  manifest changes landed upstream in this range.
- **Verified:** all JSON valid, both folder names == frontmatter `name`, no scaffold refs in the
  touched files, `coverage-deepening.md` linked from the skill, `<wp-app>` abstraction complete
  (0 stray `apps/wordpress` in `SKILL.md`).

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
