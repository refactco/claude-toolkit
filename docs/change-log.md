# Change Log — refact-os plugin marketplace

This file is a running log of every change we make to this repo while we move the
Refact skills into the plugin marketplace. **Newest first.**

Plan: see `docs/plugin-marketplace-plan.md`.

---

## 2026-08-18 — preflight-refact-config hook: match the namespaced `/base:refact` command

The `UserPromptSubmit` hook `plugins/base/hooks/preflight-refact-config.mjs` still tested the
prompt against a bare `/refact`. The command ships namespaced as `/base:refact`, so the test
never passed for the real command name and the missing-`.refact-os.json` note never appeared —
the behaviour `CLAUDE.md` describes ("the `preflight-refact-config.mjs` hook **warns** when it
is missing before a `/base:refact` action") was unreachable. The prompt test now allows an
optional `<plugin>:` prefix, so `/base:refact …` and the bare `/refact …` form both fire, while
`/refactor` still does not. The note itself now names `/base:refact config`.
Versions: base 1.8.1, marketplace 2.12.2 (the catalog entry for `base` also still read `1.7.0`
after the 1.8.0 bump, so it is realigned here).

---

## 2026-08-04 — New `memory` pack: the 7 mount-workflow skills + the freshness hook (Phase 1 of the memory-pack rollout)

Adds the ninth pack, `memory` (enabled as `memory@refact-os`). It packages the 7 memory-workflow
skills rebuilt in refact-control — `ingest-input`, `process-docs`, `log-entry`, `open-ticket`,
`close-ticket`, `project-status` (+ its `scan-status.mjs`, now resolving the mount from the
working directory instead of the script location), `update-canonical-record` — generalized per
the rollout spec (refact-control `memory/knowledge/memory-pack-rollout-spec.md` §2): mount-relative
paths only, repo-agnostic bootstrap wording, the `REFACT_MEMORY_READONLY` self-gate in every
skill, Asana board resolved from `.refact-os.json` (null ⇒ say so and stop), the
`update-canonical-record` live-working-documents guardrail, and `import-chat-history` dropped
org-wide.

Two laptop-freshness additions ride along (folded into the rollout by masoud, 2026-08-04),
mirroring the VPS executor's `write_and_push()` (refact-control
`apps/coding-agent/app/memory_repo.py`):

- **SessionStart hook** `hooks/refresh-memory-mount.mjs`: staleness-gated (4h default,
  `REFACT_MEMORY_PULL_MAX_AGE_HOURS`) `git pull --rebase --autostash` on the shared local
  refact-memory clone, a warn-only unpushed-commits line, and a wrong-branch warning (a
  leftover PR checkout makes every mount on the machine serve branch content — a failure mode
  that actually occurred during this change's own memory write). Exits silently with no mount
  or under `REFACT_MEMORY_READONLY`; every failure path is one line + exit 0. Verified against
  10 fixture scenarios (readonly guard, no mount, dangling link, fresh gate skips network,
  stale pull, offline soft-fail + clean tree, unpushed warning, wrong-branch warning,
  concurrent runs).
- **Write discipline in every mount-writing skill**: confirm the clone is on `main` (any other
  branch ⇒ stop and tell the human), pull `--rebase --autostash` before writing, lint
  (`python3 <clone>/lint/envelope_lint.py` — the same check refact-memory CI runs; caught a
  real repo-root-relative `cites:` mistake on day one), then commit
  `context(<company>/<project>): …`, then push — rejected push ⇒ pull-rebase and retry once;
  never leave a commit silently local. The hook also wires the clone's committed pre-commit
  shim (`git config core.hooksPath lint/hooks`, silent + idempotent) so hand commits get the
  same gate; fixture suite is now 11 scenarios.

Versions: memory 1.0.0 (new), marketplace 2.12.0.

## 2026-07-09 — sync-env-vars: restore the 5-char secret preview (team feedback on the audit fix)

The audit flagged a doc/script contradiction (SKILL.md promised 2-char masking; the script
previewed 5 chars) and the fix below aligned the script to the doc. Team feedback: the 5-char
preview was **intentional** — the sync runs in both directions, so seeing part of the old and
new value is what lets the user review a change before approving. Restored the 5-char preview
(`first 5 + "..."`) for secret-like keys on **both** the BEFORE and AFTER columns (the pre-audit
script only showed one side), kept the BEFORE/AFTER pair + SUMMARY line, and rewrote the
SKILL.md so the doc now matches the script — including a "never widen or narrow this preview"
note so the intent survives future audits. Known trade-off, accepted: the transcript
Stop-hook uploads the chat (including these previews) to `REMOTE_API_URL`.
Versions: base 1.6.1, marketplace 2.11.1.

## 2026-07-09 — Implement the skill audit plan: P0 fixes, sub-agent offload layer, Part 3 cleanup

Full implementation of `docs/skill-subagent-and-optimization-plan.md` (branch `feat/skill-audit-plan`).

**Part 1 — P0 fixes:**
- insights: deleted `gsc/scripts/gsc-login.mjs` — its webmasters-only scope silently overwrote the
  shared union-scope `GOOGLE_REFRESH_TOKEN` minted by ga4's `google-login.mjs`, breaking ga4/gtm.
  All gsc docs/errors now point at the shared login. gsc's CWV table row now routes to `pagespeed`.
- base/sync-env-vars: `compare_plan` now masks secrets to 2 chars + `****` (was: first 5 chars of
  every value into the chat — which the transcript hook uploads), prints BEFORE/AFTER + a SUMMARY
  line; bootstrap message prints the real script path (`$0`); removed the nonexistent
  `required_permissions` parameter from SKILL.md.
- base/setup-refact-control-mcp-server: secrets flow is `op`-CLI only; never paste secrets into chat.

**Part 2 — sub-agent offload layer (new `agents/` dir per pack):**
`insights:data-puller` (sonnet), `ops:sentry-triage` (sonnet), `ops:cloudflare-investigator`
(sonnet), `wordpress:qa-runner` (sonnet), `wordpress:wp-env-runner` (sonnet, wp-env SKILL.md
itself untouched by user decision), `testing:slice-implementer` (inherit), `base:asana-sync-runner`
(haiku). `pagespeed` now runs whole-skill in a fork (`context: fork`, `agent: general-purpose`,
`model: sonnet`) — the only skill with zero mid-flow interactivity. Dispatch notes added to
ga4/gsc/gtm/ahrefs/sentry/cloudflare/plugin-update/asana/tdd; every approval gate stays in the
main conversation. tdd's duplicated branch-detection bash → `tdd/scripts/detect-source-branch.sh`.

**Part 3 — cleanup sweep:**
- Ghost skill refs removed (`open-ticket`, `update-canonical-record`, `create-deliverable`,
  `contribute-skill`, `find-docs`/`ctx7`) — none of these skills exist.
- Scaffold-era leftovers purged: `asana.mjs` printed commands, `install-wp-skills` framing,
  `plugin-update` no longer writes a literal `${CLAUDE_PLUGIN_ROOT}` into consumers' package.json,
  wpengine `AGENTS.md` mention, cloudflare Cursor mention. (The migrate pack still names the
  scaffold on purpose — that's what it migrates.)
- Dedup: kinsta/wpengine shared blocks (~93 lines) → `plugins/wordpress/references/deploy-shared.md`
  (load-bearing safety one-liners kept inline); insights `_shared.mjs` helpers → pack-shared
  `plugins/insights/lib/common.mjs` (sibling scripts unchanged; all 23 .mjs pass `node --check` +
  import smoke); `--out` flags added to `gtm-export`, `gsc-inspect`, `pagespeed-cwv`,
  `pagespeed-audit`; testing pack single-sourced (slicing toolkit, `⚪ excluded`, harness recipe
  drift fixed, `apps/wordpress` → `<wp-app>`, backfill `next_skills: [integration-tests]`).
- Client values genericized (`credaily_764`, `cre-daily`, `stlouismagazin`, a `CREDaily` war-story
  mention). CLAUDE.md now says 8 plugins and lists `migrate/`. cloudflare stub `api.md` files
  deleted; netlify's mangled sentences fixed; nextjs `.refact-os.json` writes routed through
  base's update-project-config when installed.
- Deliberate skips: wp-env restructure (user decision); code-development's duplicated git safety
  rules (the git-workflow pack's design note marks them load-bearing).

**Versions:** base 1.6.0, insights 1.1.0, ops 1.1.0, wordpress 1.1.0, testing 1.2.0,
client 1.1.2, nextjs 1.0.2; marketplace **2.11.0**.

## 2026-07-09 — Restore 4 missing bundled files from upstream (integration-tests + draft-discovery-proposal)

A full 34-skill audit (see `docs/skill-subagent-and-optimization-plan.md`) found two skills that
could not run because SKILL.md cited bundled files that were never lifted from upstream. Recovered
all four from the upstream checkout (`refactco/refact-os` @ v2.17.1,
`templates/base/agent/skills/`):

- **`plugins/testing/skills/integration-tests/`** — added `references/integration-tests.md` (277
  lines, cited at SKILL.md L111/L129/L181), `assets/integration-triage-template.md` (L85), and
  `assets/integration-test-template.php` (L132). Adapted the upstream copies to this repo's
  standalone convention: 5 hard-coded `apps/wordpress/` paths → the detected `<wp-app>`
  placeholder the SKILL.md already uses (reference L60/L78/L107/L118, PHP template L6). No other
  content changes.
- **`plugins/client/skills/draft-discovery-proposal/`** — added `template.md` (158 lines, the
  fillable proposal skeleton cited at SKILL.md L15/L44/L53). Copied verbatim (no scaffold-isms).
- **Versions:** testing 1.1.1 → 1.1.2, client 1.1.0 → 1.1.1, marketplace 2.10.0 → 2.10.1.

## 2026-07-09 — Slim the `git-workflow` skill (thin router + split references)

`git-workflow` loaded ~4,500 tokens whenever it fired, because `SKILL.md` told the agent to read one
big reference "end-to-end". A skill's body and the references it reads stay in context for the whole
session (they load once and are **not** duplicated on re-call — verified live on Claude Code 2.1.205
via the skill/read dedup notes), so that was a large **persistent** footprint on nearly every session
(`code-development` defers here). Restructured for progressive disclosure — **no behaviour change**:

- **`plugins/base/skills/git-workflow/SKILL.md`** — rewritten as a thin router: the one rule, the
  request→action map, a compact happy-path command block, and the full "never" hard-rules inline.
  Detail moved out. The safety one-liners that must survive *before* a reference loads are kept inline
  on purpose (push-rejected → no force / no rebase; surface CI failures; the full cleanup allow-list,
  including "never a branch with no work prefix even if merged"). A design note warns future editors
  not to move detail back in or trim those lines.
- **Split the single `references/git-workflow.md`** into three that load only when needed:
  `references/happy-path.md` (preflight, base detection, branch / commit / push / PR, PR template —
  the canonical source for commands), `references/recovery.md` (blocker handling + when-to-stop-and-ask),
  `references/cleanup.md` (prune merged branches). Deleted the old combined `references/git-workflow.md`.
- **`plugins/base/skills/code-development/SKILL.md`** — repointed its two links from the old
  `references/git-workflow.md` to `happy-path.md` (mechanics) and `recovery.md` (blockers).
- **Effect:** a routine commit + PR now loads ~750–1,550 tokens instead of ~4,500; the recovery and
  cleanup detail never enter context unless actually needed. Design + rationale:
  `docs/optimize-git-workflow-skill.md`.
- **base** `1.4.2 → 1.5.0` — skill restructure + reference-layout change (no capability added or removed).
- Marketplace **2.9.1 → 2.10.0**.

---

## 2026-07-06 — Update the `writing-client-updates` guide (length + omit no-action line)

Parnia revised the `writing-client-updates` reference guide. Two new pieces of guidance and one
reversed rule; the `SKILL.md` loader and its frontmatter are unchanged.

- **`plugins/base/skills/writing-client-updates/references/writing-client-updates.md`** — added a
  new **"Match the length to the update"** section (short situation → short update; do not pad or
  invent detail); added a line to *The structure* intro that steps with nothing real behind them
  should be skipped; **reversed step 5** — when nothing is needed from the client, **omit the step
  entirely** rather than writing "There is nothing you need to do." Both worked examples updated to
  drop that line.
- **base** `1.4.1 → 1.4.2` — content refresh of one skill; no skill added or removed.
- Marketplace **2.9.0 → 2.9.1**.

---

## 2026-07-03 — Refresh the two planning docs to current state

The two `docs/` planning files had drifted from the shipped marketplace. Added a "Status" banner to
the top of each (bodies preserved as point-in-time records) and fixed one factual contradiction.

- **`docs/plugin-marketplace-plan.md`** — banner noting Stage 2 is built, the marketplace is now
  **8 packs not 7** (added `migrate`), `seo` → `insights`, `base` grew to 9 skills
  (`writing-client-updates` moved in from `client`), and current counts are **8 packs / 33 skills +
  `/base:refact`**.
- **`docs/migrate-scaffold-to-marketplace.md`** — banner noting the `asana.mjs` bug is fixed and the
  skill shipped in its **own `migrate` pack (v1.1.0), not `base`**; corrected Part C's "Pack: base"
  line to match. usc-ksom cutover still pending.
- Docs only — no plugin, manifest, or version changes.

---

## 2026-07-03 — Bump base to propagate the `/base:refact` command name

PR #6 renamed the router command references `/refact` → `/base:refact` across the docs and the
base command menu (`plugins/base/commands/refact.md`), but did **not** bump `base`. With the same
version, `claude plugin update` skips it, so installs on 1.4.0 would never pick up the new menu
text. Bump so it propagates, and fix the two remaining `/refact` mentions in the pack description.

- **base** `1.4.0 → 1.4.1` — carries PR #6's `/base:refact` command menu; `plugin.json` +
  `marketplace.json` descriptions updated `/refact` → `/base:refact`. No skill added or removed.
- Marketplace **2.8.0 → 2.9.0**.

---

## 2026-07-03 — New base skill `manage-plugins` (install/update the packs)

Installing or updating the refact-os packs was a manual, multi-step chore — `marketplace update`
only refreshes the catalog, so each installed pack still had to be bumped by hand, then a restart.
New skill automates it.

- **`plugins/base/skills/manage-plugins`** — install or update the refact-os marketplace packs: all
  installed packs, the ones a project needs, or a single named pack. Refreshes the catalog
  (`claude plugin marketplace update`), runs the actual `claude plugin install` / `update`, and
  reminds the user to restart. Ships a read-only `scripts/plugin-plan.mjs` that diffs installed vs
  the cached catalog (installed / available / to-update / not-installed). Clearly scoped **away**
  from the WordPress `plugin-update` skill (which updates a site's WP plugins).
- **`/refact install plugins`** and **`/refact update plugins`** routes added to the base router
  (both always-available base actions).
- **Disambiguated from WordPress plugin updates.** `manage-plugins` (refact-os packs) and the
  wordpress `plugin-update` skill (a site's WP plugins) now point at each other via mutual
  `when_not_to_use`; `manage-plugins` asks first on a bare "update plugins" in a WordPress project;
  and the `/refact` router spells out the split ("packs" = marketplace; "WordPress plugins" =
  `/plugin-update`).
- Base pack **1.3.0 → 1.4.0**, wordpress **1.0.0 → 1.0.1**; marketplace **2.7.0 → 2.8.0**.

---

## 2026-07-03 — Fix strict-YAML frontmatter across skills (marketplace-wide)

`claude plugin validate` was failing on eight skills whose `description` / `when_to_use` /
`when_not_to_use` values contained an unquoted `: ` (colon-space) — e.g. `Triggers: '...'`,
`Out of scope: ...`, `full pipeline: tdd-plan`, `app: locate`. Strict YAML reads that as a nested
mapping and errors; the Claude Code runtime tolerated it, so the skills still loaded. Quoted the
offending values (double-quote by default; single-quote when the value itself contains double
quotes) so the whole marketplace passes validation.

- Fixed: **base** (asana, code-development), **insights** (ga4, gsc, pagespeed), **nextjs**
  (nextjs-dev), **testing** (tdd, tdd-plan, red-green-refactor). All 8 packs now pass
  `claude plugin validate`.
- Version bumps: insights 1.0.0 → 1.0.1, nextjs 1.0.0 → 1.0.1, testing 1.1.0 → 1.1.1, migrate
  1.0.0 → 1.1.0 (docs-repair), base 1.2.0 → 1.3.0 (route + fix); marketplace 2.5.0 → **2.7.0**.

---

## 2026-07-03 — `/refact migrate` route + docs-link repair in the migrate skill

- **`/refact migrate`** — added a `migrate` row to the base router (`plugins/base/commands/refact.md`),
  in both the menu and the routing table. It invokes `migrate-to-marketplace` when the `migrate` pack
  is installed; otherwise it prints the `/plugin install migrate@refact-os` hint. Base pack
  **1.2.0 → 1.3.0**; marketplace **2.5.0 → 2.6.0**.
- **Migrate skill — docs-link repair** (was stranded off PR #2, folded in here): the detector now
  scans `docs/*.md` (skipping `docs/sources/raw/` evidence) for dead `agent/` links and reports them
  as `docsLinksToRepair`; the skill gains an opt-in Step 11 to repoint them (contract → `CLAUDE.md`,
  skill links → prose), while leaving recorded history (closed/adopt tickets) untouched.

---

## 2026-07-03 — New `migrate` pack + fixed the base `asana.mjs` project root

Added a new capability pack and fixed a real bug, off the back of a hand-run migration of the
`usc-ksom` WordPress repo onto the marketplace (findings in `docs/migrate-scaffold-to-marketplace.md`).

- **New pack `migrate`** (`plugins/migrate/`, v1.0.0) with one skill,
  `migrate-to-marketplace` — moves a refact-os-scaffolded repo off the npm scaffold onto the
  marketplace: detect the scaffold, back up, remove the generated `agent/` + `.claude/`/`.cursor/`
  trees, slim `.refact-os.json` (keep `asana`/`sentry`/`wpEnv`/`stack`), move the contract to root
  `CLAUDE.md`, hand transcript hooks to the base pack, and register/enable the packs the project
  needs. `requires_approval: true`; dry-runs first. Ships a read-only helper
  `scripts/detect-scaffold.mjs`. Registered in `marketplace.json`; top-level version 2.4.0 → 2.5.0.
- **Fixed `plugins/base/skills/asana/scripts/asana.mjs`** — `PROJECT_ROOT` used
  `path.resolve(__dirname, "..", "..")`, which at the bundled 4-deep path resolved to
  `plugins/base/skills` instead of the user's project (so `/refact sync asana` read config from the
  wrong place). Now uses `process.cwd()`, matching `sentry.mjs`.
- **Added `docs/migrate-scaffold-to-marketplace.md`** — the migration plan, the 36-skill map, the
  gap list, the `migrate-to-marketplace` spec, and the pilot findings.

---

## 2026-07-02 — Cleaned up leftover scaffold path strings

Pre-merge validation (before the PR to `main`) flagged old scaffold paths
(`agent/skills/…`, `agent/scripts/…`, `.cursor`) surviving in helper scripts. Fixed:

- **Functional:** `rollback.mjs` + `sentry.mjs` runtime messages, and a dead `$schema` pointer
  in `plugin-update.config.example.json`, now point at the real
  `${CLAUDE_PLUGIN_ROOT}/skills/<name>/scripts/…`; two false "generated into .cursor/.claude"
  header comments corrected.
- **Comments:** every `// node agent/…` usage-hint example repointed to `${CLAUDE_PLUGIN_ROOT}`.
- **Left as-is:** `sync-env-vars/sync-env.sh` excludes `.cursor`/`.claude`/`agent` dirs from its
  env-accessor scan — functional defensive behavior for the *consumer's* repo (avoids false
  positives), not a scaffold assumption about this repo.

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
