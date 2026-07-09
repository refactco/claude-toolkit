# Skill sub-agent offload + optimization plan

Date: 2026-07-09. Status: **proposed — not executed**.

## How this plan was made

- All **34 skills** in all **8 packs** were read in full (5,211 lines of SKILL.md + ~16,600 lines of support files).
- Every claim below has a file + line number. The four most serious claims were re-verified by hand.
- The sub-agent facts come from the official Claude Code docs
  (https://code.claude.com/docs/en/sub-agents.md and /skills.md), checked on 2026-07-09.

## The facts about sub-agents (verified in official docs)

These are the rules the whole plan stands on:

1. A skill can run in its own forked context (a sub-agent) by adding `context: fork` and
   `agent: <name>` to its SKILL.md frontmatter. The main chat stays clean.
2. A plugin can ship its own agents in an `agents/` folder. Each agent is a markdown file
   with frontmatter: `model` (`haiku` | `sonnet` | `opus` | `fable` | `inherit`), `tools`,
   `effort`, `maxTurns`, `mcpServers`, `skills` (preload), and more.
3. **A sub-agent can never ask the user a question.** `AskUserQuestion` is blocked for
   sub-agents. So any skill step that says "ask the user" or "get approval" must stay in
   the main conversation.
4. A sub-agent **can** use MCP tools (it can reuse the parent session's MCP connections).
5. A skill can also set `model:` and `effort:` in its own frontmatter without forking.

One important consequence for this repo: the `sub_agents:` field that every SKILL.md
declares (all 34 say `sub_agents: []`) is **not** a Claude Code feature. It is our own
convention and does nothing at runtime. The same is true for `pattern`, `when_to_use`,
`when_not_to_use`, and `next_skills` — they are useful documentation, but only
`name`, `description`, `context`, `agent`, `model`, `effort`, `allowed-tools`, and
`disable-model-invocation` change behavior. The real offload mechanisms are:
`context: fork` (whole skill), or prose in the skill body that tells the agent to
dispatch a named plugin agent for a phase.

---

# Part 1 — Fix what is broken (do this NOW, before any offload work)

These are real defects, verified by hand. Offloading a broken skill just runs the
breakage somewhere else.

## 1.1 `testing:integration-tests` — missing bundled files — ✅ FIXED 2026-07-09

The skill folder contained **only SKILL.md**, but the skill required
`references/integration-tests.md` (cited at L111, L129, L181),
`assets/integration-triage-template.md` (L85), and
`assets/integration-test-template.php` (L132). The files were never lifted from
upstream. **Resolution:** all three recovered from the upstream checkout
(`refactco/refact-os` @ v2.17.1, `templates/base/agent/skills/integration-tests/`) and
adapted to this repo's standalone convention — 5 hard-coded `apps/wordpress/` paths
replaced with the `<wp-app>` placeholder the SKILL.md already uses. The reference's
section structure matches what the SKILL.md cites (e.g. "§7 Isolation"). Testing pack
bumped to 1.1.2. So the skill was fine from the beginning — the files were lost in the
lift, not never written.

## 1.2 `client:draft-discovery-proposal` — missing `template.md` — ✅ FIXED 2026-07-09

The core instruction "Copy `template.md`" (L15, L44, L53) pointed at a file that was
not there. **Resolution:** recovered verbatim from the same upstream checkout (158
lines, the fillable proposal skeleton with `{{placeholder}}` fields; no scaffold-era
content — verified by grep). Client pack bumped to 1.1.1; marketplace to 2.10.1.

## 1.3 `insights` token-downgrade bug — one login script silently breaks the other skills

Verified by hand:

- `ga4/scripts/google-login.mjs` mints a token with the **union** of scopes
  (webmasters + analytics + tagmanager, L37–43) and saves it as `GOOGLE_REFRESH_TOKEN`
  on the 1Password item (L154).
- `gsc/scripts/gsc-login.mjs` mints a token with **only** `webmasters` (L36) and saves
  it to the **same field** (L131).

So: run the ga4 login, then later run the gsc login → the shared token loses the
analytics + tagmanager scopes, and `ga4` / `gtm` stop working with no warning.
`gsc/references/connect.md` L53 still sends users to `gsc-login.mjs`, and L60–64 even
suggests editing the `SCOPE` constant inside the installed plugin file.
**Fix:** delete `gsc-login.mjs`, point `connect.md` at the union script, and move
`google-login.mjs` somewhere pack-shared (it already serves ga4, gsc, and gtm).

## 1.4 `base:sync-env-vars` leaks secret prefixes into the chat — and the chat leaves the machine

Verified by hand. SKILL.md L159 promises: "Secrets are masked (first 2 characters +
`****`)". The script's `compare_plan` (sync-env.sh L458–477) actually prints the
**first 5 characters of every value, secrets included**, with no before/after and no
summary line. And the base pack's `claude-transcript-send-to-remote.py` hook POSTs the
whole transcript to `REMOTE_API_URL` — so those secret prefixes leave the machine.
**Fix:** make the script mask exactly as documented, and rewrite the SKILL.md table
section to describe what the script really prints.

The same skill also tells the agent to use `required_permissions: ["all"]` (L122–124)
— no such Bash-tool parameter exists.

## 1.5 Related quick fix

`base:setup-refact-control-mcp-server` L37 says "Have them paste both [secrets] into
the chat" — same transcript-hook exposure as 1.4. The `op` CLI path (L41–49) already
exists; make it the only path.

---

# Part 2 — Sub-agent offload plan (do this NEXT)

## What can be offloaded, and to which model

The rule used everywhere below (from the docs): a step can go to a sub-agent only when
it needs **no user question mid-flow**. Steps with "ask" / "confirm" / "approval" stay
in the main loop. Model choice is by the nature of the work:

- `haiku` — run a bundled script, relay a small summary. No real judgment.
- `sonnet` — pull data, aggregate, summarize; run a QA battery; read many files.
- `inherit` (the session model) — anything that writes code, tests, or client prose.

### Tier A — whole-skill offload (add `context: fork` to the skill)

| Skill | Why it qualifies | Agent / model |
|---|---|---|
| `insights:pagespeed` | The only skill with **zero** mid-flow interactivity. Both scripts compute the verdicts (thresholds in `_shared.mjs` L80–86); the agent only picks URLs and relays PASS/FAIL. Fork keeps big Lighthouse JSON out of the main chat. | `context: fork`, `agent: general-purpose`, `model: sonnet` (haiku possible once `--out` flags land — see 3.3) |

No other skill qualifies for whole-skill fork today: every other one has at least one
"ask the user" step (verified per skill in the audit).

### Tier B — phase offload via new plugin agents (`agents/` folder per pack)

These are the seven agents worth creating. Each is dispatched from the skill body
("run agent X for this step"); the gates stay in the main chat.

| New agent | Pack | Offloaded phases (evidence) | Model |
|---|---|---|---|
| `insights-data-puller` | insights | All read-only pulls: ga4 reports/realtime/metadata + admin `list`/`get` (ga4 SKILL L28–59, L70), gsc performance/sitemap-list/inspection (performance.md L10–88), gtm `gtm-list`/`gtm-export`/workspace status (gtm SKILL L30–53), ahrefs audit/keywords/backlinks (ahrefs SKILL L35–46). Saves raw JSON to `docs/sources/raw/`, returns a compact summary. Also fixes the flooding problem: `gtm-export --full` dumps the entire container JSON; `gsc-inspect` prints up to 2,000 per-URL results; `ga4-metadata` dumps the full field catalog. | `sonnet` |
| `sentry-triage` | ops | Steps 1–2 (inventory + ours/third-party split, SKILL L78–84) and per-issue drill-downs (L85–86). All script-driven (`sentry.mjs`, 389 lines). `mute`/`resolve` stays in main loop (confirm gate at L104–105). | `sonnet` |
| `cloudflare-investigator` | ops | site-triage Phase 2 (seven GraphQL pulls, site-triage.md L40–53), Phase 5 re-verification (L154–161), zone/role/GES prechecks (SKILL L235–285), the whole email-dns-audit. Needs MCP access — allowed per docs. OAuth handoffs and WAF writes stay in main loop. | `sonnet` |
| `wp-qa-runner` | wordpress | `plugin-update`: the per-plugin E5–E8 cycle — snapshot → pinned update → cache bust → full QA battery → report signals (SKILL L249–300). Already fully script-driven (14 scripts). E11 promotion approval stays in main loop (L318–320, L366). Also `check` mode (E1) end-to-end. | `sonnet` |
| `wp-env-runner` | wordpress | `wp-env`: after the up-front confirms, the long mechanical batches — setup 1a–1f (L67–198), `pull plugins`/`pull mu-plugins` rsync (L286–353), `pull db` phases 1–3+5 (L366–480), reset (L1004–1017). Keeps 10-minute Docker/rsync/composer noise out of the main chat. Gates (URL confirm, wp-config classification, sudo steps) stay in main loop. | `sonnet` |
| `slice-implementer` | testing | `red-green-refactor` is **fully sub-agent-safe per slice**: the red→green→refactor loop (SKILL L35–42) and the commit (L48) have no user gate; its only "ask" branches (L19, L25) are preconditions the `tdd` orchestrator resolves before dispatch. `tdd` dispatches one slice at a time, **strictly sequentially** (slices share one branch, tdd L54, L68). | `inherit` (writes tests + code) |
| `asana-sync-runner` | base | The read paths of `asana`: full sync / single pull / dry-run (SKILL L91–97) once `projectId` + token exist. A project with thousands of tasks streams one line per task into the chat today (script L621); the agent returns only the counts. Comment posting stays in main loop (permanent, confirm-gated at L103, L135). | `haiku` |

### Worth doing, smaller value

- `base:manage-plugins` — when the request is explicit ("update all packs"), steps 1–4
  are fully mechanical (SKILL L31–75) and could run in a `haiku` sub-agent. The
  ambiguity check (L21–23) and pack recommendation (L63–68) stay in main loop.
- `base:code-development` / `nextjs:nextjs-dev` — the check-running gates (tests/lint/
  build, code-development L31–34, nextjs-dev L48–57) can go to a `haiku` runner that
  returns pass/fail + the failing output only.
- `testing:backfill-tests` / `integration-tests` — already the most sub-agent-heavy
  skills in the repo (setup, inventory, generation, coverage triage are dispatched at
  backfill L46, L91, L112, L158). Formalizing them into named pack agents with pinned
  models is a polish step, not a change of design.

### Do NOT offload these (and why)

| Skill | Reason (evidence) |
|---|---|
| `base:git-workflow` | Mutating paths are gated: "Never force-push … without explicit confirmation" (SKILL L71–72), diverged base → "stop and ask" (happy-path.md L53–54), recovery is "hunk by hunk with the user" (recovery.md L12). |
| `base:extract-learnings`, `base:update-project-config` | Their input **is** the live main conversation; a sub-agent cannot see it. The writes are one line / one small JSON edit — briefing an agent costs more than the work. |
| `base:writing-client-updates`, `client:draft-discovery-proposal` | Client-facing writing quality + iteration with the user. Keep on the session model. (draft-discovery-proposal has no mid-flow gate, so a fork is *possible* — but pushing house-style prose to a cheaper context has no upside.) |
| `testing:tdd-plan` | Its own text: slicing "is the hardest and most valuable judgement in TDD" (L16), bracketed by two user gates (L22, L37). |
| The 4 deploy setups (`vercel`/`netlify`/`kinsta`/`wpengine`), `migrate-to-marketplace`, `install-wp-skills`, `setup-refact-control-mcp-server` | All are `requires_approval`-style flows whose value **is** the confirm gates (e.g. vercel L82/L88, migrate L21/L43). Only trivial read-only preflights could be offloaded — not worth an agent. |
| `base:sync-env-vars` (push path) | Vault writes demand explicit approval (L144–154). The pull direction could ride along with a runner later, after Part 1.4 is fixed. |

## Why offloading pays here (the numbers)

- Every skill invocation loads its whole SKILL.md into the main context.
  `wp-env` alone is 7,360 words (~10k tokens) per invocation; `integration-tests` is 26 KB.
- The flooding cases are real: full `wp-config.php` including DB password dumped into
  chat (wp-env L699), `rsync -avz` per-file output (L289, L339), one line per Asana task
  (asana script L621), full GTM container JSON (`gtm-export --full`), up to 2,000
  inspection results (`gsc-inspect`). A sub-agent absorbs all of that and returns a
  summary; the main context (and the transcript that the Stop hook uploads) stays small.

---

# Part 3 — Skill optimization backlog (LATER, in this order)

> Note (2026-07-09): a `wp-env` restructure (extract embedded PHP to `assets/`, script
> the pull-db pipeline, fix its internal contradictions) was proposed here as 3.1 and
> **removed on the user's decision — wp-env stays as it is**.

## 3.1 Remove stale references to skills that do not exist (breaks routing)

Verified by grep — none of these exist anywhere in `plugins/`:

| Ghost skill | Referenced from |
|---|---|
| `open-ticket` | base:asana L6 |
| `update-canonical-record` | base:update-project-config L6 |
| `create-deliverable` | client:render-deliverable L6, L59 |
| `contribute-skill` | client:draft-discovery-proposal L104 |
| `find-docs` / `ctx7` | testing red-green-refactor references/test-strategy.md L7 |

## 3.2 Purge scaffold-era leftovers (this repo's CLAUDE.md forbids them)

- `asana.mjs` L39–42, L494, L591: prints `npm run asana:sync …` and "Run
  `npx refact-os-scaffold init`" — neither exists in a marketplace-installed project.
- `sync-env.sh` L526–537: bootstrap message points at `.claude/scripts/sync-env.sh`
  (scaffold path) instead of `${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/`.
- `install-wp-skills` L19, L127: "refact-os scaffolder" framing.
- `plugin-update` L149: writes a **literal** `${CLAUDE_PLUGIN_ROOT}` into the consuming
  project's package.json script — the variable is unset outside a Claude session, so
  `npm run plugin-update:admin` breaks. Substitute the resolved path when writing.
- `setup-wpengine-deploy` L67: references `AGENTS.md`, a scaffold artifact.
- cloudflare site-triage.md L22: "for your host (Cursor or Claude Code)" — Cursor
  adapters were dropped.

## 3.3 De-duplicate the four "twin" deploy skills + shared code

- `setup-vercel-deploy` vs `setup-netlify-deploy`: same section skeleton, verbatim
  sentences (netlify L15 = vercel L15; L105 = L80; stop-and-ask list L138–143 =
  L111–116). Netlify L59/L65 carry a mangled copy-paste parenthetical.
- `setup-kinsta-deploy` vs `setup-wpengine-deploy`: ~80 near-verbatim duplicated lines
  (vendor policy, .gitignore rules, identical `deploy-test.php` smoke block — kinsta
  L176–183 vs wpengine L231–238).
- Remove real client values from examples: `credaily_764` (kinsta L79),
  `cre-daily` (kinsta L156–157), `stlouismagazin` (wpengine L132, L166).
- insights pack: `findRefactOsJson` is byte-identical in 5 `_shared.mjs` files;
  `getAccessToken` near-identical in 3; the OAuth callback flow duplicated in 2 login
  scripts (one of which is the Part 1.3 bug). Consolidate into one pack-shared lib.
- Add `--out` flags to `gtm-export`, `gsc-inspect`, `pagespeed-cwv`, `pagespeed-audit`
  (ga4/gsc/ahrefs already have them) so evidence saving stops relying on shell
  redirects the skills never show.

## 3.4 Testing pack consistency pass

- The slicing toolkit is duplicated wholesale: tdd-plan `references/slicing-guide.md`
  vs red-green-refactor `references/red-green-refactor-philosophy.md` §4 (same nine
  splitting patterns, same INVEST, same quotes). Keep one, reference it.
- The `⚪ excluded` definition exists in **four** places even though
  characterization-tests.md L80 declares itself canonical (also SKILL.md L102,
  ledger template L16, characterization-tests.md L120).
- The harness scaffold recipes have already drifted: backfill requires
  `includes/functions.php` before `tests_add_filter()` (backfill L53) while
  test-strategy.md L84 omits it; backfill adds `"testsEnvironment": true` (L50) which
  test-strategy.md L69–76 never mentions. One recipe, one place.
- test-strategy.md hard-codes `apps/wordpress/tests/Unit/` (L5) while the skills promise
  detect-or-ask (red-green-refactor L25, tdd L78). Align on detect-or-ask.
- Wire `next_skills: [integration-tests]` in backfill-tests (its ledger explicitly
  defers 🔌 rows to a suite "this skill does not build").
- Duplicate branch-detection bash (tdd L46–51 = test-strategy.md L175–180) → one
  shared script.

## 3.5 Small fixes

- CLAUDE.md says "ships **7 plugins**" and its layout tree omits `plugins/migrate/` —
  there are 8 (marketplace.json lists all 8; verified).
- cloudflare: `references/waf/api.md` and `references/turnstile/api.md` are 3-line
  stubs advertised as full API docs; frontmatter `references:` omits
  `references/wordpress/`, which the workflows lean on most.
- gsc SKILL.md L62 routes Core Web Vitals to "would be its own skill" — `pagespeed`
  already exists in the same pack. Pagespeed L71 claims gsc links to it; make that true.
- ahrefs `references/issue-fixes.md` bakes in one client's stale audit counts
  ("Currently **0**" L72, "where most of the current warnings sit" L50) — generalize.
- asana / sync-env-vars / manage-plugins / code-development: remove the doubled
  instructions cited in the audit (each states a rule twice; e.g. asana L103 vs L135).
- nextjs-dev `when_not_to_use` L6 names only `setup-vercel-deploy` for deploys; the
  pack also ships `setup-netlify-deploy` — and L88 itself says "Never assume Vercel".
- nextjs pack writes `.refact-os.json` directly (setup-nextjs-app L83, vercel L56,
  netlify L59) while CLAUDE.md gives writes to base's `update-project-config`.
  Decide one owner and align the prose.

---

# Execution order (summary)

| Stage | Items | Effort |
|---|---|---|
| **Now** | Part 1: ~~1.1–1.2~~ done (files restored from upstream); 1.3–1.5 remain (token bug, secret masking, secret-paste path) | ~half a day |
| **Next** | Part 2: `pagespeed` fork; then agents `insights-data-puller`, `sentry-triage`, `wp-qa-runner`, `slice-implementer`; then `cloudflare-investigator`, `wp-env-runner`, `asana-sync-runner` | ~2–3 days, incremental — each agent ships alone |
| **Later** | Part 3: 3.1–3.5 (stale refs, scaffold leftovers, dedup, testing pack, small fixes) | as capacity allows |

Every stage that touches a pack must bump that pack's `version` (plugin.json +
marketplace.json) and the top-level marketplace version, per CLAUDE.md.
