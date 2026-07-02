# Plan — Refact skills as a Claude Code plugin marketplace (7 packs)

> Planning document. **Stage 1** (this triage + design) is recorded here.
> **Stage 2** (the build) and the **Later** wind-down of the npm package are deferred.
> This supersedes the earlier 6-pack version of this plan.

## Context

**Why this is happening.** The same skills live in two places: the `@refactco/refact-os`
npm scaffolder (canonical source, now **v2.16.0**, 50 skills) and this repo — a Claude Code
**plugin marketplace** (`refactco/claude-toolkit`, one `dev-toolkit` plugin with 25
hand-copied skills). The hand-copies are drifting. The goal is to make the marketplace the
single source of truth and split the skills into **separately installable / disable-able
plugins** ("skill packs"), so any project installs just the capabilities it needs.

**Confirmed decisions (this revision):**
- **7 focused packs** — chosen for maximum install/disable control.
- **Keep `/refact`** — rebuilt as a native slash command, not a skill.
- **Keep `.refact-os.json`, but slim** — it holds only the canonical **project structure +
  tech stack** (no secrets). Skills may read it; `update-project-config` (in `base`) writes it;
  a preflight hook warns when it is missing/incomplete.
- Account for skills the old doc missed: the **TDD harness** (`tdd`, `tdd-plan`,
  `red-green-refactor`), `close-ticket`, `plugin-update`.
- **Drop the `docs/`-as-memory methodology skills** (`ingest-input`, `process-docs`,
  `open-ticket`, `close-ticket`, `update-canonical-record`, `project-status`,
  `import-chat-history`) plus `create-deliverable` and `git-it` — keeping `extract-learnings`,
  `draft-discovery-proposal`, and `render-deliverable` from the docs/client group.

**Two stages.**
- **Stage 1 (this doc)** = decide. Triage all 50 skills (keep / fix / drop / rebuild), record
  the 7-pack map, the `/refact` spec, the `.refact-os.json` schema, the hooks, and the rewrite
  contract. No skills are moved.
- **Stage 2 (later, needs go-ahead)** = build. Create the 7 plugin folders, move + rewrite the
  surviving skills, register them in `marketplace.json`.

---

## A. Disposition of all 50 refact-os skills

Source counts: 31 base + 17 packs (`client`/`code`/`nextjs`/`seo`/`wordpress`) + 2
maintainer-only = 50. Result: **19 DROP, 1 REBUILD, 6 KEEP, 24 FIX** → 30 surviving skills
+ 1 `/refact` command across 7 packs.

**DROP (19) — refact-os scaffold machinery, maintainer-only, or not needed.**

| Skill | Why drop |
|---|---|
| release | Maintainer-only: cuts the refact-os npm release. |
| write-update-note | Maintainer-only: team note about refact-os releases. |
| update-package | Bumps the refact-os npm package — irrelevant in a plugin project. |
| contribute-skill | Opens a PR to the refact-os catalog (upstream-only). |
| get-skill | Replaced by `/plugin install <pack>@refact-os`. |
| create-skill | Authors into `agent/skills/` + `refact:sync` — that resolver is gone. |
| list-skills | Reads the `agent/skills/` resolver; replaced by `/plugin` listing. |
| setup-project | Heavy `.refact-os.json` checklist — replaced by the slim `update-project-config`. |
| adopt | Plans migrating a repo to the **retired** `agent/`+`docs/`+full-`.refact-os.json` standard. |
| add-codebase | Clones into an `apps/<slot>/` monorepo and strips `.git` — assumes that scaffold. |
| import-chat-history | Not needed — imported Claude/Cursor chat logs into `docs/sources/`. |
| process-docs | Not needed — digested `docs/sources/raw/` into `docs/context/`. |
| git-it | Not needed — first-time git init + first commit + GitHub remote. |
| create-deliverable | Not needed — promoted an approved draft to `docs/deliverables/`. |
| ingest-input | Not needed — filed inbound material into `docs/sources/`. |
| open-ticket | Not needed — made tracked to-dos under `docs/task/open/`. |
| close-ticket | Not needed — closed/compressed tracked to-dos. |
| update-canonical-record | Not needed — edited the project's master truth file. |
| project-status | Not needed — reported pending docs items (little left to scan). |

**REBUILD (1) — stays as a feature, but as a command not a skill.**

| Skill | Action |
|---|---|
| refact (router) | Rebuild as `commands/refact.md` in the **base** plugin. See section C. |

**KEEP (6) — lift with only path/config repoints (no behaviour change).** Target pack in
parens.

`git-workflow` (base, drop the `agent/AGENTS.md` base-branch line) · `code-development`
(base, repoint the git-workflow reference) · `sync-env-vars` (base, repoint `sync-env.sh`) ·
`writing-client-updates` (client, pure prose) · `render-deliverable` (client, reuse
`render.mjs` + `assets/shell.html`) · `cloudflare` (ops, strip the `.cursor` env path; keep
all `references/`+`workflows/`).

**FIX (24) — lift, then rewrite the body to remove scaffold assumptions** (apply the
contract in section D). Grouped by target pack:

- **base (3):** `extract-learnings` (append to a learnings file; drop the "promote to
  `agent/AGENTS.md`" step); `asana` (read the project id from `.refact-os.json` or ask, secret
  token via env; repoint `asana.mjs`); `update-project-config` (rewritten **slim** — write only
  project structure + tech stack to `.refact-os.json`; see section B2).
- **ops (1):** `sentry` (read DSN/org/project from `.refact-os.json` or ask, auth token via
  env; repoint `sentry.mjs`).
- **client (1):** `draft-discovery-proposal` (pull from `docs/sources/` if present; create any
  output dir on demand).
- **seo (5):** `ahrefs`, `ga4`, `gsc`, `gtm`, `pagespeed` — read property/site ids from
  `.refact-os.json`, API tokens via env/1Password; **keep their `scripts/*.mjs` + `references/`**
  (substantial, do not rewrite the API logic); evidence dir on demand. `ahrefs`'s fix-routing to
  `code-development` becomes an **optional** cross-pack link.
- **nextjs (4):** `setup-nextjs-app`, `nextjs-dev`, `setup-vercel-deploy`,
  `setup-netlify-deploy` — read stack/hosting from `.refact-os.json`; `apps/<name>/` assumption
  → detect/ask; drop `refact:sync` mentions; secrets via env.
- **wordpress (5):** `wp-env`, `install-wp-skills` (drop the write into `.cursor/skills/`),
  `plugin-update`, `setup-kinsta-deploy`, `setup-wpengine-deploy` — read stack/hosting from
  `.refact-os.json`; `apps/wordpress/` monorepo → detect/ask.
- **testing (5):** `tdd`, `tdd-plan`, `red-green-refactor`, `backfill-tests`,
  `integration-tests` — de-hardcode `apps/wordpress/tests/...` to detect/ask; keep the
  existing `assets/`+`references/`. (Stays WordPress/wp-env-flavoured by design.)

## B. The 7 packs (Stage 2 target layout)

```
refact-os (marketplace — keep this name)
.claude-plugin/marketplace.json     ← registers all 7 plugins
plugins/
  base/             git-workflow, code-development, extract-learnings,
                    asana, sync-env-vars, update-project-config
                    + commands/refact.md
                    + TS/JS LSP (vtsls)
                    + hooks: vtsls auto-install, transcript→server, preflight
  client/           draft-discovery-proposal, writing-client-updates,
                    render-deliverable   (+ render.mjs, assets/shell.html, references/)
  ops/              cloudflare, sentry
                    (+ scripts/sentry.mjs + cloudflare references/ & workflows/)
  seo/              ahrefs, ga4, gsc, gtm, pagespeed
                    (+ scripts/ + references/; optional .mcp.json for Ahrefs)
  nextjs/           setup-nextjs-app, nextjs-dev,
                    setup-vercel-deploy, setup-netlify-deploy
  wordpress/        wp-env, install-wp-skills, plugin-update,
                    setup-kinsta-deploy, setup-wpengine-deploy
                    + PHP LSP (intelephense) + its auto-install hook
  testing/          tdd, tdd-plan, red-green-refactor,
                    backfill-tests, integration-tests
```

LSP split: TS/JS (`vtsls` + `check-vtsls.sh`) ship in **base**; PHP (`intelephense` +
`check-intelephense.sh`) moves to **wordpress** (PHP is WP-specific here). Each plugin gets a
`.claude-plugin/plugin.json` **with a `version` field** (none today).

**Hooks in `base`** (`hooks/hooks.json`):
1. `check-vtsls.sh` — **SessionStart**: auto-install the TS/JS language server (existing).
2. `claude-transcript-send-to-remote.py` — **Stop / SessionEnd**: POST the session chat
   transcript to `REMOTE_API_URL` (default `https://159.223.97.72:8443/transcript`). Brought
   from refact-os. Endpoint configurable; fire-and-forget; note it sends full transcripts
   off-machine.
3. `preflight-refact-config` — **UserPromptSubmit**: re-implemented from refact-os's Cursor
   `preflight-metadata.mjs` for Claude Code — warn (do not block) when `.refact-os.json` is
   missing or incomplete before a `/refact` action. Exits 0 so it never blocks a session.

(Not brought: the `claude-transcript-copy-to-repo` hook — we are not keeping a local
`docs/sources/` transcript store.)

## B2. `.refact-os.json` (kept, slim)

A small, non-secret file holding the **canonical project structure + tech stack** only. Skills
**read** it to learn the stack (is this WordPress? Next.js? what hosting?); `update-project-config`
**writes** it; the preflight hook **checks** it. Secrets/tokens never go here — they stay in env
/ 1Password. Shape (kept deliberately simple):

```jsonc
{
  "structure": { /* where things live, e.g. monorepo app slots if any */ },
  "stack":     { /* languages, frameworks, hosting — the tech stack */ }
}
```

## C. `/refact` spec (rebuilt as `commands/refact.md` in **base**)

A menu/router. `/refact` with no args prints the action menu. Each action runs the matching
skill **if its pack is installed**, else prints the `/plugin install <pack>@refact-os` hint.

| `/refact …` | Routes to | Pack |
|---|---|---|
| config (set project structure / tech stack) | update-project-config | base |
| sync asana | asana | base |
| wp-env / install wp skills / setup kinsta / setup wpengine | matching skill | wordpress |
| setup nextjs / setup vercel / setup netlify / nextjs dev | matching skill | nextjs |

**Dropped actions** (no longer have a skill): init/setup, update package, list/get/create
skill, add codebase, process docs, get chat history, git it, status. The command is graceful
about not-installed packs.

## D. Cross-cutting rewrite contract (applies to every FIX skill in Stage 2)

1. Remove `agent/skills/<x>` path refs → refer to skills by name.
2. Remove `npm run refact:sync` / `refact:validate` (no adapters to regenerate).
3. Remove `.cursor/` refs and any Cursor-hook mention.
4. **`.refact-os.json` is kept but slim** (project structure + tech stack, no secrets). FIX
   skills may **read** it for the stack/structure. Move only **secrets/credentials** out → env
   var or ask-once. `update-project-config` (base) is the only writer; the preflight hook warns
   when it is missing/incomplete.
5. **Create working dirs on demand** (`docs/sources/`, `plans/`, …) instead of assuming a
   scaffold laid them.
6. Repoint bundled scripts from `agent/scripts/` or `.claude/scripts/` → the plugin's own
   `scripts/` dir; repoint config reads to `.refact-os.json` / env.
7. Fix `next_skills`/`sub_agents` to reference only **same-pack** skills; cross-pack links
   must be optional.
8. De-hardcode WordPress paths in the testing pack to detect/ask (keep it WP-flavoured).

Stage-2 verification grep (must return nothing under `plugins/`):
```
grep -rlE "agent/skills|refact:sync|refact:validate|\.cursor" plugins/
```
(`.refact-os.json` is intentionally **allowed** now and is not in the grep.)

## E. Stage 2 build phases (deferred — not done yet)

- **Phase 1 — base correct:** create `plugins/base/`; move git-workflow, code-development,
  extract-learnings, asana, sync-env-vars, update-project-config; add `commands/refact.md`;
  keep the TS/JS LSP+hook; add the transcript→server + preflight hooks; add `version` to
  `plugin.json`; update `CLAUDE.md` (reverse the "canonical source" note; add the
  plain-English response rule).
- **Phase 2 — carve the 6 capability packs:** create each folder (`client`, `ops`, `seo`,
  `nextjs`, `wordpress`, `testing`), move + apply the rewrite contract, bring
  `scripts/`/`references/`/`assets/`, move PHP LSP to wordpress, register all in
  `marketplace.json`, fix cross-pack links.
- **Phase 3 — docs & verify:** top-level `README.md` with per-pack install commands; run the
  static + load + LSP/hook + smoke checks.

## F. What each surviving skill does (per-pack reference)

**base (6)**
- `git-workflow` — Handle git for any change: make a branch, commit, open the pull request.
- `code-development` — Extra gates for code changes: run tests/lint/build before pushing.
- `extract-learnings` — Save a durable lesson (a preference or rule) into a learnings file.
- `asana` — Asana tasks: sync tickets, pull one, comment, or post an update.
- `sync-env-vars` — Keep `.env` and the team 1Password item in sync; rebuild `.env.example`.
- `update-project-config` — Write the slim `.refact-os.json` (project structure + tech stack).

**client (3)**
- `draft-discovery-proposal` — Write a client proposal in Refact's "discovery first" style.
- `writing-client-updates` — Write a clear client update (email or Slack), headline first.
- `render-deliverable` — Turn a markdown doc into a branded, print-ready HTML/PDF.

**ops (2)**
- `cloudflare` — Cloudflare tasks: WAF, DNS, cache, bots, Turnstile, Zero Trust, email DNS.
- `sentry` — Triage Sentry errors: group, find root causes, mute/resolve to save quota.

**seo (5)**
- `ahrefs` — Ahrefs data: site audit, keywords, backlinks, rank tracking; drive fixes via PR.
- `ga4` — Google Analytics 4: pull reports and manage config (read-only by default).
- `gsc` — Google Search Console: search performance, sitemaps, URL inspection.
- `gtm` — Google Tag Manager: audit the container and stage edits (a human publishes).
- `pagespeed` — Page speed and Core Web Vitals via PageSpeed Insights (read-only).

**nextjs (4)**
- `setup-nextjs-app` — Create or adopt a Next.js app; record how to run it locally.
- `nextjs-dev` — Work inside an existing Next.js app: run dev/build/lint, fix common issues.
- `setup-vercel-deploy` — Link a Next.js app to Vercel; record deploy settings.
- `setup-netlify-deploy` — Link a Next.js app to Netlify; record deploy settings.

**wordpress (5)**
- `wp-env` — Manage the local WordPress stack with wp-env: setup, pull, reset, domain.
- `install-wp-skills` — Vendor the WordPress/Gutenberg agent skills into the project.
- `plugin-update` — Safely update WP plugins one at a time on staging, with QA + rollback.
- `setup-kinsta-deploy` — Create the Kinsta auto-deploy GitHub workflows.
- `setup-wpengine-deploy` — Create the WP Engine auto-deploy GitHub workflows.

**testing (5)**
- `tdd` — TDD orchestrator: idea → plan → red-green-refactor → one PR (WordPress unit).
- `tdd-plan` — TDD phase 1: cut a feature into thin slices, write a plan per slice.
- `red-green-refactor` — TDD phase 2: build one slice test-first (red→green→refactor), commit.
- `backfill-tests` — Add characterization tests under existing WordPress code (a safety net).
- `integration-tests` — Build real-plugin integration tests for surfaces that can't be stubbed.

**command (1)** — `/refact` — menu/router slash command to the installed skills (section C).

## G. Gap analysis — here vs refact-os (what to bring / update / remove in Stage 2)

Current `dev-toolkit` has 25 skills; the survivor set is 30 + the `/refact` command.

**BRING (17) — survivors NOT in `dev-toolkit` today; copy from refact-os + apply the contract.**
`ahrefs`, `ga4`, `gsc`, `gtm`, `pagespeed`, `setup-nextjs-app`, `nextjs-dev`,
`setup-vercel-deploy`, `setup-netlify-deploy`, `wp-env`, `install-wp-skills`, `plugin-update`,
`setup-kinsta-deploy`, `setup-wpengine-deploy`, `tdd`, `tdd-plan`, `red-green-refactor`.

**UPDATE-IN-PLACE (13) — already here; keep but repoint/rewrite.**
- KEEP (light repoint, 6): `git-workflow`, `code-development`, `sync-env-vars`,
  `writing-client-updates`, `render-deliverable`, `cloudflare`.
- FIX (body rewrite, 7): `extract-learnings`, `asana`, `update-project-config`,
  `draft-discovery-proposal`, `sentry`, `backfill-tests`, `integration-tests`.

**REMOVE (12) — currently in `dev-toolkit`, decided DROP.**
`adopt`, `create-skill`, `list-skills`, `setup-project`, `import-chat-history`, `process-docs`,
`git-it`, `ingest-input`, `open-ticket`, `update-canonical-record`, `project-status` — and
`refact` (rebuilt as the `commands/refact.md` command, not a skill).

> Reconciliation: 25 here = 13 update-in-place + 11 remove + `refact`. After Stage 2:
> 30 skills + 1 command across 7 packs.

## Files changed in Stage 1 (this decision)

1. **`docs/plugin-marketplace-plan.md`** — this rewrite (sections A–G). Supersedes the older
   6-pack version.
2. **`docs/change-log.md`** — dated entries recording this decision.

**No changes** to `plugins/`, `marketplace.json`, `CLAUDE.md`, or any `SKILL.md` in Stage 1.

## Verification (Stage 1)

Stage 1's output is a decision document, so verification is a review:
- The triage table lists **all 50** skills exactly once; every survivor maps to one of the 7
  packs.
- No pack exceeds 25 skills (largest pack — `base` — has 6); every survivor's `next_skills`
  will resolve within its own pack (cross-pack links marked optional).
- The doc records the confirmed decisions (7 packs, keep `/refact`, slim `.refact-os.json`,
  transcript+preflight hooks, Stage-1-only scope) and `docs/change-log.md` has the new entry.
- (Deferred to Stage 2: the grep above, a fresh-project load test, per-pack smoke tests.)

---

# Later — deprecate the `@refactco/refact-os` npm package (deferred)

> Do **not** start until Stage 2 is built and proven on real projects. Recorded so the end
> state is on file. Stage 1 and Stage 2 only **copy** content out of refact-os; they do not
> touch or break it.

All three of refact-os's jobs are removed once the marketplace is built, so the npm tool is
wound down:
1. Stop shipping skills (the catalog now lives in the marketplace).
2. Final npm release = a deprecation notice pointing to the marketplace; then
   `npm deprecate @refactco/refact-os "..."`.
3. Archive the repo (or replace its README with a redirect).
4. Move `docs/agent-first-repo-best-practices.md` into this repo's `docs/` for design history.
5. `lib/`, `bin/`, `templates/`, `.cursor/`/`.claude/` generation all retire with the package.
   (`adapters.js` index logic is available to copy back only if a plugin ever exceeds 25
   skills.)
