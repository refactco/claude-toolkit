# Migrating a refact-os scaffolded project onto the plugin marketplace

> Case study: **usc-ksom**. Also: the spec for a new **`migrate-to-marketplace`** skill.
> This is a **plan / review**. Nothing here has been executed. Decisions for you are at the end.
> Backed by a 9-agent audit workflow (drift check → skill map → gap list → skill design → adversarial verify).

> **Status — updated 2026-07-03 (read this first).** The plan is **largely executed**. Treat the
> forward-looking parts below (Parts C/D, "Now vs Later", "Open decisions") as the original proposal,
> not the current state. What actually shipped:
> - **The `asana.mjs` bug (Part D) is fixed** — `PROJECT_ROOT = process.cwd()` is in place.
> - **The skill was built — but in its own `migrate` pack, not `base`.** `migrate-to-marketplace`
>   ships as `plugins/migrate/` (v1.1.0), `requires_approval: true`. So `/base:refact migrate` prints
>   `/plugin install migrate@refact-os` when that pack is not installed (Part C proposed `base`; a
>   dedicated opt-in pack was chosen instead).
> - **The `/base:refact migrate` route + the docs-link repair step both landed** (change-log 2026-07-03).
> - **The usc-ksom cutover is still pending** — see "Still open for usc-ksom" at the very bottom
>   (install the packs, `/docs` link repair, commit the branch).
>
> See `docs/change-log.md` for the running log. Everything below is the original plan + the pilot.

---

## TL;DR (plain English)

- **usc-ksom is a textbook refact-os v2.16.0 scaffold.** Skills live in `agent/skills/` (36 of
  them). `.claude/` and `.cursor/` are **generated copies** ("do not edit by hand"). A fat 13.5 KB
  `.refact-os.json`. Transcript hooks. An npm dependency `@refactco/refact-os`.
- **All 36 skill bodies are STOCK.** The project never hand-edited a skill. So deleting `agent/`
  and installing the marketplace packs **loses no project-specific skill logic**. This is the key
  finding that makes migration safe.
- **Yes, we can build a skill to do the migration.** Proposed name: **`migrate-to-marketplace`**
  in the `base` pack. It detects the scaffold, backs up, removes the generated trees, slims the
  config, and prints the exact `/plugin install` commands. It **dry-runs first and asks before it
  changes anything**, and it **warns instead of deleting** whenever a human must decide.
- **The real work is not the skills — it is the 5 things the packs do NOT carry:** the fat
  `.refact-os.json` config blocks, the BigQuery MCP server, the local transcript hook, the
  `docs/` knowledge system + its internal links, and the `agent/AGENTS.md` contract.
- **One real bug found in this marketplace:** the `base` pack's `asana.mjs` reads config from the
  wrong folder. Fix it before telling anyone `/refact sync asana` works. See Part D.

---

## Part A — What usc-ksom is today (the review)

| Thing | Detail |
|---|---|
| Model | `@refactco/refact-os` **v2.16.0** npm scaffolder |
| Skills | 36 under `agent/skills/` (canonical source) |
| Adapters | `.claude/skills`, `.cursor/skills` — **generated** from `agent/` on `refact:sync` |
| Config | `.refact-os.json` 13.5 KB — but **8.8 KB is a `_scaffold` bookkeeping block** |
| Hooks | transcript **copy-to-repo** + **send-to-remote** (Stop / SessionEnd) |
| MCP | a project-specific **BigQuery** server in `.cursor/mcp.json` (`BIGQUERY_PROJECT=ksom-bigquery-ga4`) — **not from the marketplace** |
| docs/ | actively used: `context/` (client 230 lines, learnings, ai-search), `decisions.md`, `task/open` (43 tickets), `task/closed` (484 stubs), `sources/raw` |
| Stack | WordPress multisite, WP Engine, Timber + Pattern Lab theme, wp-env (PHP 8.2) |
| npm scripts | `refact:*` (scaffolder), `asana:*` / `sentry:*` / `chats:*` (call `agent/scripts/*`), `wp:*` / `theme:*` (project tooling) |

**Drift verdict:** every one of the 36 skills is the old scaffold form, not a client edit. The only
"project-looking" strings (`ksom.local`, `stlouismagazin`) are shared doc examples, present
identically (or dropped) in the marketplace copy.

---

## Part B — How usc-ksom uses this marketplace instead (target state)

### B1. Packs to install

```
/plugin marketplace add /Users/masoudgolchin/Documents/Refact Projects/new-plugin
/plugin install base@refact-os        # REQUIRED — git-workflow, code-dev, asana, env, /refact, TS/JS LSP, hooks
/plugin install wordpress@refact-os   # REQUIRED — wp-env, install-wp-skills, plugin-update, setup-wpengine-deploy, PHP LSP
/plugin install ops@refact-os         # REQUIRED here — sentry (live config), cloudflare
/plugin install testing@refact-os     # RECOMMENDED — tdd chain + backfill/integration tests
/plugin install client@refact-os      # RECOMMENDED — draft-discovery-proposal, render-deliverable
# insights@refact-os   OPTIONAL — GA4 here runs via the project BigQuery MCP, NOT the insights skills' MCPs
# nextjs@refact-os      DO NOT INSTALL — no Next.js surface
```

### B2. The 36-skill map (what happens to each)

**Moves to a pack (20 — all stock, adopt the pack version):**

| Skill | Pack | Skill | Pack |
|---|---|---|---|
| asana | base | git-workflow | base |
| sync-env-vars | base | extract-learnings | base¹ |
| update-project-config | base² | writing-client-updates | base |
| cloudflare | ops | sentry | ops |
| draft-discovery-proposal | client | render-deliverable | client |
| wp-env | wordpress | install-wp-skills | wordpress |
| plugin-update | wordpress | setup-wpengine-deploy | wordpress³ |
| setup-kinsta-deploy | wordpress⁴ | tdd | testing |
| tdd-plan | testing | red-green-refactor | testing |
| backfill-tests | testing | integration-tests | testing |

¹ survives, but **no longer promotes hard rules into `AGENTS.md`** — see gaps.
² body is stock, but the **schema it targets changed** (slim) — see the config caveat.
³ this is usc-ksom's real deploy path (`hosting=wpengine`).
⁴ ships in the pack but unused here.

**Becomes a command (1):** `refact` → the `/refact` slash command in `base` (a router, not a skill).

**Dropped — obsolete by the new model (8), no action needed:**
`adopt`, `git-it`, `setup-project` (one-time bootstraps already run) · `create-skill`,
`list-skills`, `get-skill`, `contribute-skill`, `update-package` (the whole
"author skills locally + `refact:sync`" system is replaced by `/plugin install`).

**Dropped — no pack replacement (7), decide per item:**
`ingest-input`, `process-docs` (the evidence→knowledge pipeline) · `open-ticket`, `close-ticket`
(mostly covered by `asana` for Asana-sourced tickets) · `update-canonical-record`,
`project-status` (unused / reporting) · `import-chat-history` (local chat import).

### B3. `.refact-os.json` — fat → slim (careful)

A pure "structure + stack only" file is **not enough**: the pack skills read more blocks.

- **KEEP (packs read these):** `stack`, `asana` (`projectId`, `tokenItem`), `sentry`
  (`org`/`project`/`ownPaths`/`tokenItem`), `wpEnv` (`localDomain`/`port`).
- **KEEP (human-owned project notes, harmless):** `project`, `repository`, `apps`, `operations`,
  `docs`, `secrets` (pointers only), `integrations`.
- **DROP (true cruft):** `_about`, `_scaffold` (the 8.8 KB block).
- **Key remap needed: NONE.** The marketplace `asana`/`sentry` skills read the **exact same keys**
  usc-ksom already has. Tokens still come from 1Password at run time, never from the file.
- **Edit surgically** — delete only the `_about` and `_scaffold` keys **in place**. Do not
  `JSON.parse → stringify` the whole file (that reorders keys / drops comments).

### B4. Gaps — what the marketplace does NOT carry, and what to do

| Gap | Severity | What to do |
|---|---|---|
| **BigQuery MCP** (`.cursor/mcp.json`) | **High** | Do **not** delete `.cursor` wholesale. Keep the tracked `mcp.json` (there is a `!**/.cursor/mcp.json` git carve-out), or port it into a Claude `.mcp.json`. Keep the SA-key `scp` + the `settings.local.json` grants. |
| **Local transcript hook** (`copy-to-repo`) | Medium | Base ships only `send-to-remote`. Choose: keep `copy-to-repo.py` and register it by hand, or accept remote-only capture. (Remote endpoint is unchanged; local copies were git-ignored anyway.) |
| **`ingest-input` + `process-docs`** | Medium | No replacement. File and digest inbound material by hand. (usc-ksom already curated `client.md` by hand, so daily loss is small.) |
| **`extract-learnings` no longer writes `AGENTS.md`** | Medium | Add hard rules to the new root `AGENTS.md` by hand. Fix the stale link in `learnings.md` line 3. |
| **Stale contract + broken `docs/` links** | Medium | Move `agent/AGENTS.md` → root `AGENTS.md`; repoint `docs/index.md`, `learnings.md`; resolve the missing `open-decisions.md`. |
| **`chats:import` script** | Low | No pack home. Keep the local `.py` or drop the feature. |
| `open/close-ticket`, `update-canonical-record`, `project-status` | Low | `asana` covers Asana tickets; the rest are unused / by hand. |

### B5. What BREAKS on migration, and the fix

1. **7 npm scripts break** — `asana:*` and `sentry:*` call `node agent/scripts/*.mjs`; deleting
   `agent/` makes them fail. **Fix:** remove them; run the work through the skills (`/refact sync
   asana`, the sentry skill). The pack scripts live under `CLAUDE_PLUGIN_ROOT`, not reachable from
   `package.json`.
2. **`chats:import` breaks with no replacement** — remove it, or port the script into a base skill.
3. **`refact:*` scripts + the `@refactco/refact-os` devDependency go dead** — remove all four and
   the dependency together; note in the change log that sync/validate/migrate no longer exist.
4. **Fresh clones get zero skills** — pack enablement lives in the **git-ignored, per-user**
   `settings.local.json`. **Fix:** add the `/plugin install …` commands to the README so each
   teammate runs them; keep a **committed** `.claude/settings.json` for the team permission allows
   (`git commit/push`, `gh pr create`) so nobody gets re-prompted.
5. **Before removing the devDependency:** grep for real `require`/`import` of the package (not just
   scripts). Make `npm install` a manual step, not an automated one.

---

## Part C — The migration skill: `migrate-to-marketplace`

**Answer to your question: yes — and it should be a NEW skill, not a revived `adopt`.**
`adopt` only printed a read-only plan and is retired. This one **executes** the move, but safely.

- **Pack:** _(as shipped)_ a dedicated **`migrate`** pack (`plugins/migrate/`), **not** `base` — an
  opt-in install so only repos doing a migration pull it in. `pattern: procedure`,
  `next_skills: []`, `requires_approval: true`.
- **Also added** a `/base:refact migrate` row to `base/commands/refact.md` (routes to the `migrate`
  pack; prints the `/plugin install migrate@refact-os` hint when it is not installed).
- **Bundled helper:** `scripts/detect-scaffold.mjs` (the marker scan + "signal → pack" derivation +
  the slim-file diff), referenced via `${CLAUDE_PLUGIN_ROOT}/skills/migrate-to-marketplace/scripts/detect-scaffold.mjs`.

### What it does (ordered)

1. **Detect + dry-run.** Scan for scaffold markers (`agent/skills/`, `.claude/GENERATED.md`,
   `@refactco/refact-os`, `refact:*` scripts, `_scaffold` in the config). No markers → stop
   ("already migrated"), just print the install commands. Markers → print the full plan and **wait
   for approval**.
2. **Precondition:** confirm the marketplace is added and `base` is installed.
3. **Back up first.** Branch `chore/migrate-to-marketplace`; copy every to-be-removed tree into a
   git-ignored, timestamped `.refact-os-backup/<date>/`.
4. **Drift check (warn, never delete).** Diff each local skill body vs the stock pack copy. Known
   path rewrites are fine; any real edit is listed as a warning and left in place until the human
   confirms. List every skill with **no** pack equivalent so the human decides before it is lost.
   *(Ordering note: add the marketplace / install the derived packs **before** this step so a stock
   reference exists to diff against.)*
5. **Move the contract.** Draft root `AGENTS.md` from `agent/AGENTS.md`: keep the hard rules,
   `.refact-os.json` rule, front-end build table, branches/PRs, env sync; drop the "never edit
   .cursor/.claude / run refact:sync" rule and every `agent/skills/` reference. **Human reviews.**
6. **Slim the config in place.** Delete only `_about` and `_scaffold`, preserving key order and
   formatting. Keep everything else. Never delete the file.
7. **Preserve (do not touch):** `docs/`, `.env`, app code, `tools/`, `.github/`, `.wp-env*.json`,
   the tracked `.cursor/mcp.json`, and the `settings.local.json` grants.
8. **Remove generated trees** (after backup): `agent/skills`, `agent/hooks`, generated
   `.claude/skills` + `.claude/hooks` + `GENERATED.md`, `.cursor/skills` + `.cursor/hooks` — but
   **keep** `.cursor/mcp.json`, `.claude/settings.json`, `settings.local.json`, `.claude/logs`.
9. **Pick the transcript model** (local copy vs remote-only) — ask, do not silently drop local.
10. **Clean `package.json`** — remove `refact:*` + the devDependency; ask about `asana:*` /
    `sentry:*` / `chats:*`; keep `@wordpress/env` + `wp:*` / `theme:*`.
11. **Fix `.gitignore`** — drop `**/.last-sync`; keep the `mcp.json` carve-out + transcript ignore.
12. **Repair `docs/` links** — `index.md`, `learnings.md`, the `open-decisions.md` reference.
13. **Print the derived install commands** (from detected signals, not hardcoded).
14. **Restart + verify** (see below). Commit / open a PR only if asked.

### What it must NOT do automatically (flag for a human)

- The root `AGENTS.md` rewrite (judgement).
- Deleting a **drifted** skill (human confirms the logic is captured).
- The 7 lost capabilities with no pack (keep local script vs manual habit vs accept loss).
- Deciding which optional packs (insights) to install.
- Anything with **secrets** — 1Password items, `.env`, the BigQuery SA key are never read or moved.
- Running `npm install` (network / lockfile side effects) — suggest it, don't run it.

### Idempotent + verifiable

Safe to re-run (step 1 short-circuits if no markers). Verify after restart: no markers left; config
still parses and still has `stack`/`asana`/`sentry`/`wpEnv`; `docs/`, `.env`, `apps/`,
`.cursor/mcp.json` untouched; root `AGENTS.md` exists with no `agent/skills` refs; `/refact` menu
renders; `/refact sync asana` resolves `asana.projectId`; `npm install` clean.

### Feasibility

Ships today as `plugins/base/skills/migrate-to-marketplace/SKILL.md`. It meets every authoring rule
(folder = name; `next_skills: []`; script under `scripts/` via `CLAUDE_PLUGIN_ROOT`). Bump **three**
versions: `base/plugin.json`, the base entry in `marketplace.json`, and the top-level marketplace
version.

### One schema tension to resolve first

`update-project-config` says the config is **only** `structure` + `stack` and forbids
`sentry`/`asana`/`apps` blocks — yet the migrated file keeps exactly those (because `asana`/`sentry`
skills read them). Either reword `update-project-config` to allow pack-owned blocks, or document the
split loudly in the file header. (Low real risk — that skill only makes surgical edits, it has no
prune step.)

---

## Part D — Fix this marketplace bug first (blocks `/refact sync asana`)

`plugins/base/skills/asana/scripts/asana.mjs:51`

```js
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");   // ← wrong at the pack path
```

At the installed path `plugins/base/skills/asana/scripts/`, this resolves to
`plugins/base/skills` — so it looks for `.refact-os.json` and writes `docs/task/` **inside the
plugin folder**, not the user's project. `sentry.mjs:51` already does it right:

```js
const PROJECT_ROOT = process.cwd();   // ← the fix for asana.mjs too
```

**Fix:** change `asana.mjs` line 51 to `process.cwd()`. One line. Do this before claiming the
asana skill works from an installed pack.

---

## Now vs Later

**Now (small, safe, high value):**
1. **Fix the `asana.mjs` PROJECT_ROOT bug** (Part D) — 1 line, unblocks the base pack.
2. **Author `migrate-to-marketplace`** in `base` + its `detect-scaffold.mjs` + the `/refact migrate`
   row; bump the 3 versions.
3. Resolve the `update-project-config` schema wording (Part C).

**Later (the actual usc-ksom cutover — run the skill on a branch):**
4. Run `migrate-to-marketplace` on usc-ksom, review every warning, keep the backup until verified.
5. Hand-handle the 5 gaps (BigQuery MCP, transcript hook, docs pipeline, `AGENTS.md`, links).
6. README bootstrap + committed `settings.json` permissions so fresh clones work.

---

## Open decisions for you

1. **Build `migrate-to-marketplace` now**, or first pilot the migration on usc-ksom by hand and turn
   the checklist into a skill afterward?
2. **Transcript capture** after migration: keep the local `copy-to-repo` mirror, or remote-only?
3. **The 7 no-replacement skills** (`process-docs`, `ingest-input`, …): accept manual, or should any
   be rebuilt as marketplace skills?
4. Want me to **fix the `asana.mjs` bug** as a standalone change right away?

---

## Pilot results — usc-ksom, 2026-07-03 (done by hand)

Ran the migration by hand on usc-ksom to gather findings before writing the skill. All on branch
**`chore/migrate-to-marketplace`** (off `stage`), with a full backup at
`.refact-os-backup/2026-07-03/` (git-ignored). Constraints applied this run: **contract → root
`CLAUDE.md`** (not a new `AGENTS.md`), **`/docs` left untouched**, **`asana`/`sentry`/`wpEnv` kept**,
**MCP kept repo-based**.

### What was executed

| # | Action | Result |
|---|---|---|
| 1 | Fixed `asana.mjs` in the **marketplace** (`PROJECT_ROOT = process.cwd()`), removed dead `__dirname`/`fileURLToPath` | `node --check` OK |
| 2 | Ported BigQuery MCP → committed root **`.mcp.json`** (`${HOME}/toolbox`); kept `.cursor/mcp.json` | repo-based MCP for Claude Code + Cursor |
| 3 | Wrote root **`CLAUDE.md`** = the real contract (hard rules, `.refact-os.json` rule, front-end build table, branches/PRs, MCP); dropped scaffold rule #5 + the `refact:sync` tooling section | contract moved off `agent/` |
| 4 | Root **`AGENTS.md`** → thin pointer to `CLAUDE.md` | no dead link to the deleted `agent/AGENTS.md` |
| 5 | Slimmed **`.refact-os.json`** in place — removed only `_about` + `_scaffold` (8.8 KB), kept 11 blocks incl. `asana`/`sentry`/`wpEnv`/`stack` | valid JSON; skill-read keys intact |
| 6 | **`package.json`** — removed 13 scripts (`refact:*`, `asana:*`, `sentry:*`, `chats:*`) + the `@refactco/refact-os` devDep; kept `wp:*`/`theme:*` + `@wordpress/env` | did **not** run `npm install` (left to user) |
| 7 | **`.gitignore`** — dropped dead `**/.last-sync`; added `.refact-os-backup/` | — |
| 8 | Removed `agent/`, `.claude/{skills,scripts,GENERATED.md}`, `.cursor/{skills,hooks,scripts,GENERATED.md,hooks.json}` | kept `.claude/{settings.json,settings.local.json,hooks,logs}` + `.cursor/mcp.json` |
| 9 | Rewrote root **`README.md`** (was full of `refact:sync` / `agent/skills` instructions) | preserved envs/multisite/theme/deploy content |

Result: 303 deletions, 6 modified, 1 new (`.mcp.json`); `docs/`, `apps/`, `tools/`, `.github/`,
`.env` untouched.

### Findings that change the skill spec

1. **The `asana.mjs` bug was real and pack-blocking** — the skill's job is easier now that the
   marketplace copy is fixed, but the skill's verify step should still assert
   `/refact sync asana` resolves the real `.refact-os.json`.
2. **`.claude/` is git-tracked; `.cursor/**` is git-ignored except `mcp.json`.** The skill must
   `git rm` the tracked `.claude` adapters but can plain-`rm` the untracked `.cursor` ones — and
   must **keep the committed `.claude/settings.json`** (it carries the team `git commit/push` +
   `gh pr create` permission allows, which plugins do **not** provide).
3. **Contract target is a choice.** Here it went to `CLAUDE.md` (user preference), with `AGENTS.md`
   as a pointer. The skill should ask: contract → `CLAUDE.md` or `AGENTS.md`.
4. **`/docs` is opt-in.** Left untouched by request, so `docs/context/learnings.md` still links the
   now-gone `agent/skills/extract-learnings/SKILL.md`. The skill must treat docs-link repair as a
   separate, opt-in step, not part of the core move.
5. **The root `README.md` needs rewriting too** — it carried heavy scaffold instructions. The skill
   should offer to rewrite README, not just the contract file.
6. **Transcript hooks left as-is (undecided).** `.claude/settings.json` still runs both
   `copy-to-repo` + `send-to-remote`. Once `base` is installed, its `hooks.json` **also** POSTs on
   Stop/SessionEnd → **double send-to-remote**. The skill must ASK: keep local `copy-to-repo`? drop
   the project `send-to-remote` and let base own it?
7. **MCP: use `${HOME}`, not Cursor's `${userHome}`,** in the Claude `.mcp.json`. The `toolbox`
   binary + SA key are per-user (not present on every machine) — config travels, secrets don't.
8. **`.env` may not exist locally** (it's per-user, gitignored). The skill must never assume it.
9. **`npm install` left manual** — package.json no longer lists `@refactco/refact-os`, but the
   lockfile still does; user runs `npm install` to prune. The skill should suggest, not run it.
10. **Config slim was a safe `parse → dump`** because the file was pure JSON (no comments). The
    skill should still delete keys in place and handle a JSONC file if one ever appears.

### Round 2 decisions (same day) — corrections to findings 6 & 7

- **Transcript hooks → owned by the plugin, removed from the repo.** Stripped the `hooks` block
  from `.claude/settings.json` (kept the `permissions` allows) and deleted `.claude/hooks/`. The
  `base` pack's `hooks.json` runs `claude-transcript-send-to-remote.py` on Stop/SessionEnd, so the
  repo no longer needs its own. **The marketplace has no "save-to-repo" hook** (the old
  `copy-to-repo` was deliberately not brought over) — which matches the goal of **not** saving
  transcripts into the repo. Skill rule: strip the hooks block, keep permissions, delete
  `.claude/hooks`, let `base` own transcript-send.
- **MCP finding was wrong — corrected.** The BigQuery MCP was **not** working from `.cursor/mcp.json`
  (Cursor-only; Claude Code never reads it) and **not** from a local `toolbox` binary (not
  installed). It worked via the **claude.ai-connected `BigQuery_MCP` remote integration**
  (`mcp__claude_ai_BigQuery_MCP__*`), authorized per-project in the git-ignored
  `.claude/settings.local.json`, with the SA key at `~/.config/gcloud/ksom-bigquery-sa.json`. So we
  **removed** the speculative root `.mcp.json` and documented the real setup in `CLAUDE.md`. Skill
  rule: do **not** auto-port `.cursor/mcp.json` to a repo `.mcp.json`; check `~/.claude.json` +
  `settings.local.json` for how MCP is actually wired, and ask before creating a repo MCP file.
- **Cursor removed entirely** (team doesn't use Cursor): deleted `.cursor/` and its `.gitignore`
  carve-out lines.
- **npm still needed, but only for WordPress dev.** `package.json` stays for `@wordpress/env`
  (`wp:*`) and the gulp theme build (`theme:*`); ran `npm install` to prune `@refactco/refact-os`
  from the lockfile (0 refs left). The plugin marketplace replaces the refact-os npm scaffolder,
  not wp-env/gulp.

### Still open for usc-ksom
- `/docs` link repair (finding 4) — when you lift the "don't touch docs" hold.
- Install the packs (`/plugin install …`) and restart to load skills / LSP / the transcript hook.
- Review + commit the branch / open the PR.
