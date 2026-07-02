---
name: plugin-update
description: Safely update WordPress plugins one at a time on staging with changelog-driven QA (error, functional, visual) and auto-rollback — promoting to production only on a human-approved pass.
pattern: procedure
requires_approval: true
when_to_use: /plugin-update [check|setup|execute] — or "plugin update", "are there plugin updates", "safely update <plugin>", "run plugin update QA". Checking for and safely applying WordPress plugin updates on a hosted (Kinsta/WP Engine) project, one plugin at a time on staging with QA + auto-rollback, promoting to prod only on a human-approved pass.
when_not_to_use: Local-only code dev (use wp-env); non-WordPress projects; changes to the in-repo theme or custom mu-plugin (those deploy via git — use git-workflow / code-development); WP core or PHP upgrades (out of scope unless explicitly extended).
next_skills: []
sub_agents: []
---

# plugin-update Reference

Use this reference when the user asks to **check for and safely apply WordPress plugin updates** — e.g. "are there plugin updates?", "update the plugins", "safely update WPForms", "run the plugin update QA loop".

It runs the full loop for **one plugin at a time**: read the changelog → draft a targeted QA checklist → snapshot → update **on staging** → QA (three layered signals) → **pass** promotes the *same* version to production (human-gated) or **fail** rolls back on staging. It never updates production blind, and never updates more than one plugin per cycle so rollback scope stays clean.

The skill ships **theme-agnostic**. Everything project-specific — routes, interactive flows, visual masks, and the **CSS selectors** the interactive checks use — is **discovered at Setup and written to the project's config** (`qa.selectors` / `qa.probes` / `qa.routes` / `qa.flows`). The Playwright specs read every selector from config and **skip a check when its selector is absent**, so the same suite is correct on a blog, a magazine, or a shop.

## Commands

`/plugin-update [check|setup|execute]` (or plain language: "plugin update", "are there plugin updates", "safely update <plugin>"). Default subcommand is **execute**.

| Subcommand | Does | Mutates? |
|---|---|---|
| **check** | List every plugin with a pending update on staging (`check-updates.mjs`). Report only — touches nothing. | no |
| **setup** | Per-project calibration: scaffold the Playwright suite + npm scripts + deps + config into this project, discover routes/flows/masks/**selectors**, capture baselines, commit, **stop**. Run once. | local files only |
| **execute** | The full update→QA→promote/rollback loop (E1–E11). Requires Setup to have run. | staging, then prod on approval |

If `execute` is requested but no config exists, tell the user to run `/plugin-update setup` first (or fall back to running Setup).

## What this does (execute)

```
check live updates (WP-CLI, not git) ──▶ loop over EVERY pending update, one at a time
        │                                  (excludes the custom mu-plugin)
        ▼   ┌──────────────────────  per plugin  ──────────────────────┐
read changelog ──▶ draft targeted QA checklist (baseline + changelog-derived)
        ▼
   changelog high-risk? (DB migration / irreversible schema change / breaking removal)
   ├─ YES ─▶ DEFER: do NOT update. Flag "needs manual review". CONTINUE to next. (never updated this run)
   └─ NO ─▶ continue
        ▼
snapshot staging (db export + version + data-integrity "before"; +SEO fingerprint only if SEO plugin)
        ▼
update plugin ON STAGING ──▶ bust cache (host + CDN)
        ▼
QA: ① error signals (HARD) ② functional/health/interactive/admin (HARD) ③ visual diff (SOFT)
        ▼
   decision rule (this plugin)
   ├─ hard signal failed      ─▶ AUTO-ROLLBACK on staging, flag, CONTINUE to next
   ├─ visual diff over thresh ─▶ FLAG for human, leave on staging, CONTINUE to next
   └─ all clear               ─▶ queue for promotion, CONTINUE to next
        └──────────────────────────────────────────────────────────────┘
        ▼
when none remain ──▶ summary ──▶ request human approval ──▶ promote the PASSED set to PROD (pinned)
```

**Why WP-CLI, not git:** third-party plugins are **not** tracked in the repo (typically only the theme and custom mu-plugins under the WordPress app directory are — see that directory's `.gitignore`). The deploy pipeline (path-filtered to the WordPress app directory) ships only that tracked code. Plugin updates happen server-side via WP-CLI over SSH. So "promote to production" means **re-running the exact same `wp plugin update` on the production environment**, *not* a git merge.

## Canonical layout

The skill ships with the Playwright suite + an example config bundled under `templates/` (Setup copies them into the project — they are **not** at the project root until Setup runs):

```
skills/plugin-update/                        ← this skill
├── SKILL.md                                 ← this file
├── config.schema.json                       ← JSON Schema for the project config
├── references/qa-checks.md                  ← the full QA check catalog (built vs backlog)
├── scripts/                                 ← .mjs (run over SSH/WP-CLI; theme-agnostic)
│   ├── lib/config.mjs · wp.mjs · check-updates.mjs · fetch-changelog.mjs
│   ├── discover-routes.mjs · discover-selectors.mjs   ← Setup-time per-project discovery
│   ├── snapshot.mjs · rollback.mjs · error-signals.mjs · fingerprint.mjs · data-integrity.mjs
│   └── mint-admin-session.mjs · form-config.mjs · form-cleanup.mjs
└── templates/                               ← PROJECT artifacts Setup scaffolds into the repo
    ├── plugin-update.config.example.json     ← seed config (Setup copies + fills + discovers)
    └── tests/e2e/                            ← the Playwright suite (theme-agnostic)
        ├── playwright.config.ts · qaConfig.ts · lib/forms.ts
        └── health · functional · interactive · forms · admin · forms-submit · visual  (.spec.ts)
```

After Setup, the consuming project gains (all at the repo root, **not** deployed to the host):

```
<project-root>/
├── plugin-update.config.json                ← skill-owned config (committed)
├── tests/e2e/…                              ← the suite above + generated baselines:
│   ├── broken-links-baseline.json · forms-baseline.json   ← committed baselines (per project)
│   └── __screenshots__/                      ← committed visual baselines (per project)
├── .plugin-update-snapshots/                 ← gitignored DB exports + QA pass records
└── package.json                             ← + plugin-update:* scripts, + 2 devDeps
```

> **Config location note.** Config lives at the repo root as `plugin-update.config.json` (idiomatic — same level as `.wp-env.json`). `lib/config.mjs` also accepts `.claude/plugin-update.json` as a fallback.

---

## Preflight (always)

1. **WordPress project.** Confirm this is a WordPress project — read `.refact-os.json` › `stack.wordpress` if present, and confirm the WordPress app directory exists (detect it from the repo, or ask the user — e.g. `apps/<name>` in a monorepo). If it is missing in `.refact-os.json`, ask the user. If it isn't WordPress, stop — this flow is WordPress-specific.
2. **SSH + WP-CLI reach staging.** The hard dependency for everything below:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/wp.mjs staging -- core version
   ```
   Prints a version → green. `Permission denied (publickey)` → the local SSH public key isn't registered with the host; print `~/.ssh/id_ed25519.pub` and tell the user to add it (Kinsta: MyKinsta → Your Settings → SSH Keys), then re-run. Asks for a password → switch the host user to key-based auth.
3. **Pick the subcommand.** `check` → run E1 only and stop. `setup` → Setup mode (S1). `execute` (or none) → if `lib/config.mjs` finds a config → Execute (E1); otherwise tell the user to run Setup first.

---

## Setup mode (`/plugin-update setup`)

First run only. Scaffolds the project artifacts, calibrates to **this** site, captures baselines, confirms with the human, then **stops**. Idempotent — each sub-step is skipped silently if already satisfied. Setup never updates a plugin.

### S1 — Write `plugin-update.config.json`

Copy `${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/templates/plugin-update.config.example.json` to the repo root as `plugin-update.config.json`, then fill it from `.refact-os.json` › `stack.wordpress`:

| `.refact-os.json` path | config field |
|---|---|
| `stack.wordpress.hosting` | `hosting` |
| `stack.wordpress.environments.staging.{ssh,url,branch}` | `environments.staging` |
| `stack.wordpress.environments.production.{ssh,url,branch}` | `environments.production` |

Then set the skill defaults:
- `mode`: `traditional` (single Playwright pass against the WP site). Use `headless` only when the frontend is a separate app (e.g. Next.js).
- `excludePlugins`: the project's custom mu-plugin slug(s) — never auto-updated (and as mu-plugins they won't appear in `wp plugin list` anyway; keep them listed as a guard).
- `qa.visualDiff`: `{ "maxDiffPixelRatio": 0.02, "masks": [] }` — masks filled in S6.
- `cache`: `{ "kinsta": true, "cloudflare": true }`.

Validate by running any read command through `wp.mjs` (it loads + validates config on every call).

### S2 — Install Playwright + faker

**Node version matters.** Playwright's TS loader breaks on some Node builds (`context.conditions?.includes is not a function` — seen on Node 22.17 / 23.11). Two mitigations, both applied: prefer Node 18/20/22 LTS, **and** always run Playwright with `PLAYWRIGHT_FORCE_ASYNC_LOADER=1` (the `plugin-update:*` scripts bake it in). Then:
```bash
npm install --save-dev @playwright/test@^1.61.0 @faker-js/faker@^10.5.0
npx playwright install chromium      # add --with-deps on Linux/CI (no-op on macOS)
```

### S3 — Add the npm scripts

Add to `package.json` › `scripts` (each prefixed with `PLAYWRIGHT_FORCE_ASYNC_LOADER=1`):
```json
"plugin-update:functional": "PLAYWRIGHT_FORCE_ASYNC_LOADER=1 playwright test --config tests/e2e/playwright.config.ts tests/e2e/functional.spec.ts tests/e2e/health.spec.ts tests/e2e/interactive.spec.ts tests/e2e/forms.spec.ts",
"plugin-update:interactive": "PLAYWRIGHT_FORCE_ASYNC_LOADER=1 playwright test --config tests/e2e/playwright.config.ts tests/e2e/interactive.spec.ts",
"plugin-update:links:update": "PLUGIN_UPDATE_LINKS_UPDATE=1 PLAYWRIGHT_FORCE_ASYNC_LOADER=1 playwright test --config tests/e2e/playwright.config.ts tests/e2e/interactive.spec.ts",
"plugin-update:forms:update": "PLUGIN_UPDATE_FORMS_UPDATE=1 PLAYWRIGHT_FORCE_ASYNC_LOADER=1 playwright test --config tests/e2e/playwright.config.ts tests/e2e/forms.spec.ts",
"plugin-update:forms-submit": "PLAYWRIGHT_FORCE_ASYNC_LOADER=1 playwright test --config tests/e2e/playwright.config.ts tests/e2e/forms-submit.spec.ts",
"plugin-update:admin": "node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/mint-admin-session.mjs && PLAYWRIGHT_FORCE_ASYNC_LOADER=1 playwright test --config tests/e2e/playwright.config.ts tests/e2e/admin.spec.ts",
"plugin-update:visual": "PLAYWRIGHT_FORCE_ASYNC_LOADER=1 playwright test --config tests/e2e/playwright.config.ts tests/e2e/visual.spec.ts",
"plugin-update:visual:update": "PLAYWRIGHT_FORCE_ASYNC_LOADER=1 playwright test --config tests/e2e/playwright.config.ts tests/e2e/visual.spec.ts --update-snapshots"
```

### S4 — Copy the Playwright suite to the repo root

```bash
mkdir -p tests/e2e/lib
cp -R ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/templates/tests/e2e/. tests/e2e/
```
Put tests at **repo root** `tests/e2e/` — the deploy is path-filtered to the WordPress app directory, so the harness never deploys. The suite is theme-agnostic: it reads everything project-specific from `plugin-update.config.json`.

### S5 — Discover the baseline route list (human confirms)

The baseline checklist is one representative URL per **page type**, run on **every** update. Discover from the XML sitemap (each sub-sitemap is a type = a template):
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/discover-routes.mjs --env staging
```
It finds the sitemap (via `robots.txt`, falling back to common paths), takes one representative per type, adds home/search/404, and **HTTP-verifies each path** against the target env. **Show the proposed list to the human and get confirmation** before saving — only the human knows which types are business-critical, and for visual baselines they should swap newest-post representatives for **evergreen** ones (sitemaps list newest-first). Record them in `qa.routes` (`{ name, path, pageType }`; `path` is relative to the env `url`). Pick **specific, stable** URLs so screenshots are reproducible.

### S6 — Detect site-specific flows + visual masks

Flows that live at a **site-specific URL** must be **discovered and declared** in `qa.flows` (path-valued), so they're only checked on projects that have them — never hardcode a URL. Detect by **active plugin + the page that embeds it**:
- **Event-submission** (`flows.submitEvent`) — if an event-submission plugin is active (`wp plugin list --status=active`), find the page embedding its shortcode/block: `wp db query "… post_content LIKE '%[event_form%' OR '%tribe_community_events%'"` → record that path. None found → omit the key → the check skips.

**Masks** for the visual layer (dynamic regions that legitimately change between captures — record CSS selectors in `qa.visualDiff.masks`): ad slots, announcement bars, sponsored/rotating sliders, timestamps.

> **Mask discipline (learned the hard way).** Each mask selector must target a **small, specific** region. NEVER mask a `<body>`/global class or a huge content container — Playwright paints masked regions solid magenta, so a body-level mask makes the *entire* screenshot magenta and the baseline becomes vacuous. After capturing, **open the PNGs and look**: if a page is mostly magenta, a mask is too broad. Probe a selector's element with `boundingBox()` before trusting it.

### S7 — Discover this project's selectors (human confirms)

The interactive/functional checks read **every** theme-specific selector from `qa.selectors` (and probe routes/queries from `qa.probes`) — **nothing is hardcoded**. A check whose selector/probe is absent is **skipped, not failed**. Propose a starting set from the live DOM, then refine + confirm:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/discover-selectors.mjs --env staging
```
It fetches the homepage + a single-post route and suggests a candidate selector per category. WordPress-core / popular-plugin markers (block nav, block buttons, core lightbox, Ajax Load More) are **detected**; brand/theme-specific regions (custom share blocks, bespoke nav wrappers, event filters, search-results containers) it reports as **discover manually** — **inspect the real DOM** (Playwright/devtools) to fill those, then **confirm the set with the human** and write `qa.selectors`. Fill the matching `qa.probes` too:
- `searchQuery` (a term that returns results) + `searchNoMatchQuery` (a nonsense term)
- `eventsArchivePath` + `eventsFilterQuery` (if the site has a filtered archive)
- `loadMoreArchivePath` (if the site paginates via load-more)

Selector categories (see `config.schema.json` › `qa.selectors` for all): `navWrapper`, `footer`, `navDropdownToggle`/`navSubmenuContainer`, `ctaButton`, `shareBlock`/`shareControls`, `tableOfContents`, `lightboxTrigger`/`lightboxOverlay`, `eventsFilterInput`/`eventsListingContainer`, `loadMoreWrap`/`loadMoreItems`/`loadMoreButton`, `newsletterSignup`/`newsletterEmailField`, `searchResults`/`searchEmptyState`, `hamburgerButton`/`mobileNavLinks`.

> **Forms need no selectors.** The form engine (`lib/forms.ts`) discovers WPForms / Gravity / CF7 / Ninja / HubSpot / Mailchimp / plain `<form>` generically — no form id or container selector to configure.

### S8 — Add `.gitignore` entries

Add to `.gitignore` (root) — these are test artifacts / dumps, not source:
```
.plugin-update-snapshots/
test-results/
playwright-report/
playwright/.cache/
*.sql
*.sql.gz
```
**Do not** ignore `tests/e2e/__screenshots__/` — visual baselines are committed.

### S9 — Capture baselines, commit, stop

Bust cache first (Step E7), then:
```bash
npm run plugin-update:visual:update      # baseline screenshots → tests/e2e/__screenshots__/
npm run plugin-update:forms:update       # forms + required fields per route → forms-baseline.json
npm run plugin-update:links:update       # accepted pre-existing broken links → broken-links-baseline.json
```
Eyeball the captured PNGs — a baseline of a broken page poisons every future diff. Sanity-check `forms-baseline.json` (it should list the real forms). Then hand off to the **git-workflow** skill to branch/commit the config, the Playwright setup, the npm-script + devDep changes, and the baselines. **Stop** and tell the human setup is complete; the next run executes the loop.

---

## Execute mode (`/plugin-update execute`)

Processes **every plugin with an available update** — but **one at a time (sequentially), never batched.** Loop the full E2–E10 cycle over each plugin: a passed plugin stays updated on staging and is marked ready-to-promote; a failed plugin is rolled back on staging and flagged. When the list is exhausted, report a summary and promote the passed set (one human approval). Sequential-not-batch is what makes a failure attributable to a single plugin and rollback clean — it is **not** a limit on how many get updated per run.

### E1 — List ALL available updates
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/check-updates.mjs
```
Returns JSON of every plugin with `update=available` on **staging**, excluding `excludePlugins`. If empty → report "no updates" and stop. (This is also exactly what `/plugin-update check` runs and stops at.)

### E2 — Take the next plugin
Take the next from the list (the user may name a specific one; otherwise go in order, preferring inactive/low-risk before active/critical so a problem surfaces on something low-impact first). Record `slug`, `from` (installed), `to` (available). E3–E9 operate on this one plugin; after E9 return here for the next.

### E3 — Read the changelog
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/fetch-changelog.mjs --slug <slug> --from <from> --to <to>
```
WordPress.org plugins API; falls back to the plugin's `readme.txt` over SSH for premium/off-directory plugins. Read for: security fixes, DB migrations/schema changes, deprecations/removed hooks, changed templates/blocks, new settings, breaking API changes.

**Auto-defer high-risk updates (don't block the run).** If the changelog shows a **DB migration / irreversible schema change**, a **destructive data migration**, or a **breaking removal** of hooks/APIs the theme or another plugin may depend on, **do not update this plugin this run**: record it as **deferred — "needs manual review"**, flag it, and go straight back to **E2**. Deferred plugins are listed in the E11 summary so a human can update them deliberately with a DB backup/restore plan. **When in doubt, defer.** (Deprecations / new settings / changed templates are *not* defer triggers; they feed the targeted checks in E4.)

### E4 — Draft the targeted QA checklist
Combine the **baseline** checklist (always: errors, data-integrity, page health, search, menus/forms render, admin, visual) with **targeted** checks for *this* plugin:

- **SEO-output check** (`fingerprint`) — switch ON only if the plugin is an **SEO / output plugin** (Yoast `wordpress-seo`, Rank Math `seo-by-rank-math`, AIOSEO `all-in-one-seo-pack`, SEOPress `wp-seopress`, The SEO Framework) **or** the changelog touches `<head>` / meta / canonical / robots / schema / sitemap / enqueued assets. For an ordinary feature plugin it compares identical pages and always passes — **skip it.**
- **Forms are checked on EVERY update** (a cache/SEO/JS-optimizer plugin breaks a form just as easily). Two generic layers across all form plugins: `forms.spec.ts` (**HARD** — every form still renders with its required fields, baseline-delta) in the functional bundle; `plugin-update:forms-submit` (**SOFT** — a real `QA-TEST`-stamped submit) each cycle. A live captcha/anti-spam block is reported **inconclusive**, never failed. Optionally run `form-config.mjs` to assert the WP-configured confirmation message exactly.
- **Plugin settings page** — set `PLUGIN_UPDATE_SETTINGS_PAGE` to this plugin's admin screen so the admin check loads it.
- Plus changelog one-offs (e.g. "fixed AJAX submission" → exercise that flow).

### E5 — Snapshot staging
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/snapshot.mjs --env staging --slug <slug>
```
Exports the staging DB (`wp db export`, to a gitignored path) and records the installed version + a `debug.log` marker so the error-signal layer diffs only **new** log lines. Also capture the "before" baselines the E8 deltas need:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/data-integrity.mjs --env staging --capture   # ALWAYS
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/fingerprint.mjs --env staging --capture      # ONLY if the SEO-output check applies (E4)
```

### E6 — Update on staging
Pin the version so staging and production get the identical build, then read back what landed:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/wp.mjs staging -- plugin update <slug> --version=<to>
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/wp.mjs staging -- plugin get <slug> --field=version
```
Use the **read-back version** as `<to>` for the promotion (E10). One plugin only. If the update errors outright → immediate fail → rollback (E10-fail).

### E7 — Bust cache
Host object/page cache + any CDN in front, or QA screenshots read stale HTML:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/wp.mjs staging -- cache flush
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/wp.mjs staging -- kinsta-cache purge --all   # if the host's wp-cli cache command exists
```
For a CDN edge (e.g. Cloudflare), use the **cloudflare** skill to purge the staging hostname. Wait for propagation before screenshots.

### E8 — QA: three layered signals
Trust the **combination**, not screenshots alone. The full presence-driven catalog (detect/assert/gate, built vs backlog) is in [references/qa-checks.md](references/qa-checks.md). The skill runs what each page actually has and **skips what's absent**, comparing a same-build pre-update baseline (delta, not absolute); only deterministic signals gate the auto-rollback.

| Layer | Tool | Catches | Trust |
|---|---|---|---|
| ① Error signals | `error-signals.mjs` — `debug.log` diff (new FATAL/Uncaught only), HTTP 5xx / WSOD on every `qa.routes` URL, `wp plugin verify-checksums` | fatal breakage | **HARD** |
| ② Functional / interactive | Playwright (`functional` + `health` + `interactive`) — performs the flows (search, menus, forms render, filters, load-more, config-declared `qa.flows`/`qa.selectors`) | "looks fine but broken" | **HARD** |
| ③ Visual diff | Playwright `visual.spec.ts` — `toHaveScreenshot()` vs committed baselines, with masks | layout/UI regressions | **SOFT** |

```bash
# HARD (gate auto-rollback — deterministic only):
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/error-signals.mjs --env staging --slug <slug>   # ALWAYS
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/data-integrity.mjs --env staging --compare      # ALWAYS
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/fingerprint.mjs --env staging --compare         # ONLY for SEO/output plugins (E4)
npm run plugin-update:functional   # health (every page type) + search + mobile menu +
                                   #   interactive (config-driven: nav/footer links, dropdown, CTA, share,
                                   #   TOC, lightbox, filters, load-more, submit-event, newsletter) +
                                   #   forms render (generic: every form still renders w/ required fields)
npm run plugin-update:admin        # authenticated: wp-admin + block-editor + plugin settings load
                                   #   (mints a short-lived session over SSH — no stored password; set
                                   #    PLUGIN_UPDATE_SETTINGS_PAGE to the updated plugin's settings screen)
# SOFT (flag for a human — never auto-rollback):
npm run plugin-update:visual          # viewport screenshot diff vs committed baselines
npm run plugin-update:forms-submit    # real form submit (generic), data stamped QA-TEST. SOFT: a live
                                      #   captcha/anti-spam block → inconclusive (never a fail). Has side
                                      #   effects (real entry/notification) — runs staging AND prod (E10).
```
Every interactive check is **detect-and-skip** (absent/unconfigured on a site → skipped, not failed) and **first-party-scoped**; link checks are **baseline-delta** (only a link the update *newly* breaks gates). For the production smoke check in E10, prefix the commands with `PLUGIN_UPDATE_ENV=production`.

On a green staging run (`hardFail: false`), `error-signals.mjs` writes a **staging pass record** (`<snapshotDir>/<slug>-staging.pass.json`) stamping the slug + QA'd version. This is the second factor the production promotion gate (E10) requires — it can't be self-issued. `fingerprint.mjs` and `data-integrity.mjs` each also **revoke (delete)** it on their own HARD fail, so a structural/data regression can never leave a promotion authorized.

### E9 — Apply the decision rule
See **Decision rule** below.

### E10 — Per-plugin outcome (then loop to the next)

Apply the decision to **this** plugin, then return to **E2**:
- **Hard fail** → auto-rollback on staging, flag, **continue** (production never touched):
  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/rollback.mjs --env staging --slug <slug> --to <from>
  ```
- **Visual over threshold, no hard fail** → leave on staging, flag for the human, continue.
- **All clear** → leave updated on staging (pass record written in E8), **queue for promotion**, continue.

### E11 — Summary & promote the passed set

When no updates remain, report: **promoted-candidates** (passed staging QA), **rolled-back** (hard-failed), **flagged** (visual), and **deferred** (high-risk changelog — never updated this run). Deferred plugins are *not* promoted; list them with the changelog reason. Then promote the passed set — the **production promotion**, gated on explicit human approval. Stop and ask. On approval, **for each passed plugin**:
```bash
# 1. snapshot prod, then promote the EXACT staging-QA'd version (pinned)
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/snapshot.mjs --env production --slug <slug>
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/wp.mjs production --allow-prod-write -- plugin update <slug> --version=<to>
# 2. bust PRODUCTION caches (--env production)
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/wp.mjs production --allow-prod-write -- cache flush
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/wp.mjs production --allow-prod-write -- kinsta-cache purge --all
#    + purge the production hostname at the CDN edge (use the cloudflare skill)
# 3. production smoke check (env-agnostic signals only)
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/error-signals.mjs --env production --slug <slug>
PLUGIN_UPDATE_ENV=production npm run plugin-update:forms-submit
# 4. clean up the QA-TEST entries the submit created (email notifications can't be un-sent)
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/form-cleanup.mjs --env production --confirm --allow-prod-write
```
Each `wp.mjs production` promotion **refuses** unless `--version=<to>` matches that plugin's fresh staging pass record. If a **prod smoke check fails**, immediately roll that plugin back on prod (others already promoted stay):
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/rollback.mjs --env production --slug <slug> --to <from> --allow-prod-write
```
Promote **one plugin at a time on prod too** (pinned + smoke each), so a prod-only failure is isolated.

> **Staging↔prod drift is real (prod-run learning).** A plugin can pass staging QA and still fatal on prod when prod runs a plugin/premium add-on that staging doesn't (e.g. a premium SEO add-on active only on prod, or a shared library like Action Scheduler bundled by a prod-only plugin winning the load race). The prod smoke check + auto-rollback catch it, but **QA on a staging that mirrors prod** (re-clone staging from prod before a run), and update free + premium counterparts **in lockstep**. Use only env-agnostic checks for the prod smoke (forms/flow/visual baselines are staging-keyed).

---

## Decision rule

Applied per plugin (the run continues to the next either way):
```
changelog high-risk (PRE-update)?  (DB migration | irreversible schema change | destructive data
                                    migration | breaking removal of hooks/APIs)
   └─ YES ─▶ DEFER: do NOT update. Flag "deferred — needs manual review". CONTINUE to next.
   └─ NO ─▶ proceed to update + QA, then:
hard signal failed?  (fatal in debug.log diff | HTTP 5xx/WSOD | functional/admin assertion broke |
                      fingerprint SEO/status loss | data-integrity version-back/content-loss | update errored)
   └─ YES ─▶ AUTO-ROLLBACK this plugin on staging. Flag it. CONTINUE to next. (never reaches prod)
   └─ NO
        visual diff over threshold (and no hard failure)?
           └─ YES ─▶ FLAG for human. Leave on staging. CONTINUE to next.
           └─ NO ─▶ ALL CLEAR ─▶ queue for promotion. CONTINUE to next.
─────────────────────────────────────────────────────────────────────────────
when no updates remain ─▶ promote the QUEUED (passed) set ─▶ each needs human approval +
                          a fresh version-matched staging pass record (pinned, prod-smoked one at a time)
```

- **Hard** signals decide automatically (rollback). **Soft** (visual) only ever flags.
- Promotion to production **always** stops for human approval, even on a clean pass.

## Rollback

Primary mechanism is **version-pin reinstall** (deterministic, no git):
```bash
wp plugin install <slug> --version=<old-version> --force
```
`rollback.mjs` wraps this and, if the changelog indicated a DB migration, can also restore the pre-update DB export from `snapshot.mjs`. One plugin at a time keeps the blast radius to a single plugin. Premium plugins not on WordPress.org can't be reinstalled by slug+version — for those, restore the plugin directory from the snapshot or the host's backup; `rollback.mjs` detects this and tells you.

## Config

Shape + field docs live in `config.schema.json`. `lib/config.mjs` resolves the file from (in order) `plugin-update.config.json` (repo root, canonical) then `.claude/plugin-update.json` (fallback), validates required fields, and builds the SSH/WP-CLI invocation. The per-project `qa.selectors` / `qa.probes` / `qa.routes` / `qa.flows` blocks are written by Setup.

## Scripts

| Script | Purpose | Writes? |
|---|---|---|
| `lib/config.mjs` | load + validate config; build the SSH/WP-CLI invocation; **deny-by-default** mutation classification; `excludePlugins` + pass-record helpers | no |
| `wp.mjs <env> [--allow-prod-write] -- <wp args>` | run a WP-CLI command on an env. Three guards: refuses any `excludePlugins` write on every env; refuses mutating commands on `production` without `--allow-prod-write`; refuses a prod promotion unless a fresh, version-matched staging pass record exists | passthrough |
| `check-updates.mjs` | `wp plugin list --update=available` on staging, minus `excludePlugins` → JSON | no |
| `discover-routes.mjs --env <env>` | Setup: route discovery from the XML sitemap (one per page type) + HTTP-verify → proposed `qa.routes` | no |
| `discover-selectors.mjs --env <env>` | Setup: best-effort per-project selector candidates from the live DOM → proposed `qa.selectors` (agent refines + human confirms) | no |
| `fetch-changelog.mjs --slug --from --to` | WordPress.org API changelog, sliced to the version range; SSH `readme.txt` fallback | no |
| `snapshot.mjs --env --slug` | `wp db export` (gitignored) + record installed version + runId + debug.log marker | writes local dump |
| `rollback.mjs --env --slug [--to] [--restore-db --confirm-restore]` | version-pin reinstall (+ optional DB restore); refuses excluded plugins + cross-env snapshots | **yes (server)** |
| `error-signals.mjs --env --slug` | HTTP status of all routes + debug.log diff (new fatals only) + checksums → pass/fail JSON; writes/clears the staging pass record | writes pass record |
| `fingerprint.mjs --env --capture\|--compare` | delta-vs-baseline per route: SEO head, headers, analytics tags, asset manifest, status — HARD on SEO-structural/status loss, SOFT otherwise | writes baseline |
| `data-integrity.mjs --env --capture\|--compare` | delta-vs-baseline: plugin versions/active-state, content counts, cron — HARD on version-backward / deactivation / content-loss / cron-empty | writes baseline |
| `mint-admin-session.mjs --env` | mints a short-lived (2h) authenticated session over SSH (no stored password) → Playwright storageState | writes gitignored session |
| `form-config.mjs --env` | reads each form's WP-configured confirmation message over SSH → JSON, so the submit check can assert the exact success text | no |
| `form-cleanup.mjs --env [--confirm] [--allow-prod-write]` | removes the `QA-TEST` entries the SOFT submit creates — dry-run unless `--confirm`; refuses prod without `--allow-prod-write` | **yes (server, with --confirm)** |

## Guardrails

- **Never update production blind.** Always staging → QA → promote. Production is touched only on a clean pass *and* explicit human approval. Enforced in code three ways: deny-by-default mutation classification, the `--allow-prod-write` flag, and the fresh-version-matched staging pass record.
- **All pending updates, one at a time.** A run loops over *every* plugin needing an update, but updates + QAs + decides each **in isolation** — never batch. Passes get promoted, failures rolled back + flagged, high-risk-changelog plugins **deferred** — nothing pending is silently dropped.
- **Never touch the custom mu-plugin / theme code.** It's in `excludePlugins`, enforced as a hard refusal in `wp.mjs` and `rollback.mjs` on *every* environment. Those deploy via git (use git-workflow / code-development), not this skill.
- **Promotion is WP-CLI on prod, not a git merge.** Plugins aren't tracked; never try to deploy a plugin update through the WordPress app directory's deploy pipeline.
- **Pin the version on promotion** (`--version=<to>`) so prod gets exactly what was QA'd.
- **Never auto-decide on the visual layer.** It flags; humans rule on it.
- **Forms are an unconditional render gate, real-submit SOFT.** Render (HARD) + real submit (SOFT) run on *every* update regardless of which plugin changed; the changelog governs only the *additional* targeted checks. Real submits create real entries/notifications (stamped `QA-TEST`) — run `form-cleanup.mjs` after; the admin email can't be un-sent. Coverage limits: forms behind a login aren't discovered; file-upload fields can't be auto-filled.
- **Snapshot before every update** (DB export + version record). The version-pin is primary; the DB export covers schema migrations.
- **Never commit DB dumps.** Write them to a gitignored path (`.plugin-update-snapshots/`).
- **Config lives at the repo root** as `plugin-update.config.json`.
- **Bust cache before screenshots** (host + CDN) or you QA stale HTML.
- **Selectors are config, never code.** Every theme selector lives in `qa.selectors`; if a check needs to change, edit config — don't hardcode a selector in a spec.

## When to stop and ask the user

- Preflight SSH check fails → print the exact key-registration steps; don't proceed.
- An update is available for a plugin in `excludePlugins` → never auto-apply; surface it.
- The changelog mentions a **DB migration / irreversible schema change / destructive data migration / breaking removal** → **auto-defer** (E3) and continue; report it as *deferred* in E11.
- The visual diff is over threshold with no hard failure → flag with before/after; never auto-promote.
- About to promote to **production** → always stop for explicit human approval.
- A premium/off-directory plugin can't be version-pin reinstalled → surface; the rollback path needs the host backup.
- Staging visibly differs from production (prod-only active plugins / premium add-ons) → say so before relying on staging-only QA; re-clone staging from prod first.
