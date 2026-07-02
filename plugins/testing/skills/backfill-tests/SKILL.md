---
name: backfill-tests
description: Generate unit tests for existing WordPress code that was NOT built test-first — backfilling characterization coverage for the plugins, mu-plugins, and themes you maintain. Trigger on '/backfill-tests', 'backfill tests'.
pattern: procedure
when_to_use: You want test coverage under code that already exists (written before TDD) — "/backfill-tests", "backfill tests", "add a safety net before refactoring", "characterize this plugin/theme". The complement to the TDD harness (tdd → tdd-plan → red-green-refactor), which drives NEW code test-first.
when_not_to_use: Driving new code test-first (that's the TDD harness's job). Third-party / gitignored plugins and themes (vendor code, never in scope). Refactoring or fixing the code under test rather than pinning its current observable behaviour.
next_skills: []
sub_agents: []
---

# Backfill Tests — Characterization Tests for Existing Code

The code already exists — written before TDD — and you want a safety net under it. So instead of driving design (that's the TDD harness), you **characterize** the code's current observable behaviour and pin it with behaviour-driven unit tests. The result is a regression suite that lets the code be changed later with confidence.

## What this skill does NOT do

- **Does not modify the code under test.** You test *around* it. If a test exposes a bug, surface it — never silently pin it (step 6).
- **Does not slice features or open a PR.** It ends after the suite is green, the ledger is dispositioned, coverage is shown, and a commit is offered (step 9).
- **Does not test, load, or modify third-party code.** Gitignored plugins/themes are never scanned. It *does* **stub** the simple third-party deps your code calls (hand-written fakes, no mocking libs) so a surface can still be characterized — you always assert on **your** code. A **complex** dep (deep object graph) is flagged `🔌 integration`, not faked. Rule + technique: `references/characterization-tests.md` §11.

## The flow

Nine steps, two fan-out phases (inventory, generation), three user gates. Two tracking artifacts, kept distinct:

- **`COVERAGE.md` ledger — tracks _surfaces_.** Durable, committed, the cross-session resume point (steps 4–9).
- **`TodoWrite` list — tracks _the procedure and folders_.** Throwaway, in-session GPS. Don't copy surfaces into it.

**Open the todo list before step 1** and keep it live. Seed it with the steps below; **expand it at step 3 into one item per confirmed folder** (that's where the thread gets dropped in step 5's loop). Keep exactly **one item `in_progress`**, give **each gate its own item** (step 3, step 4 scope, step 8), and flip a folder to `completed` only once its sub-agent has returned *and* its ledger section is updated.

1. Set up / verify the harness
2. Discover maintained folders
3. **Gate:** confirm the scan list
4. Inventory surfaces into the ledger → **Gate:** confirm this session's scope
5. Generate tests (one sequential sub-agent per folder)
6. Run the full Generated suite & report
7. Iterate to green + ledger fully dispositioned
8. **Gate:** measure coverage, surface shallow `✅`, ask before deepening
9. Offer to commit

---

### 1. Set up / verify the harness (delegate to a sub-agent)

First, locate the **WordPress app directory** (`<wp-app>` below). Detect it from the repo (the folder holding `.wp-env.json` / `wp-content/`, e.g. `apps/wordpress` in a wp-env monorepo), or read it from `.refact-os.json` if present; if it is unclear, **ask the user**. Everything in this skill is relative to that directory.

**Do:** Check once whether `<wp-app>/tests/Unit/` exists (there is exactly one tests dir — don't hunt). Setup is noisy (Docker, ~10-min first `wp-env start`, `composer install`), so **delegate the whole thing to an `Agent` sub-agent** with these instructions:

**If `<wp-app>/tests/Unit/` is absent — scaffold:**

- **`.wp-env.json`** — add `"tests": "./<wp-app>/tests"` to `mappings`; set `"testsEnvironment": true`; add a unique `"testsPort"` if it would clash with the dev `"port"`.
- **`<wp-app>/tests/phpunit.xml.dist`** — PHPUnit 9, `bootstrap="bootstrap.php"`, testsuite dir `Unit/` suffix `Test.php`. Add a `<coverage processUncoveredFiles="true">` block scoping coverage to **maintained source only**: each plugin as `<directory suffix=".php">../wp-content/<base>/<slug></directory>` (single-file plugin as `<file>`); a **theme only as `functions.php` + `inc/` + `lib/`, never the whole folder**. *Why:* without scoping the % measures core/vendor and is meaningless; `processUncoveredFiles` loads every included file, and theme template files (`header.php`, …) fatal when loaded standalone. (Reconciled with the scan list in step 8.)
- **`<wp-app>/tests/composer.json`** — pin `phpunit/phpunit: ^9.6`, `yoast/phpunit-polyfills: ^1.1`.
- **`<wp-app>/tests/bootstrap.php`** — (1) load the polyfills autoload; (2) `require $_tests_dir/includes/functions.php` **before** any `tests_add_filter()`; (3) register a `muplugins_loaded` filter that `require`s each maintained plugin entry file (guard with `file_exists`); (4) `require $_tests_dir/includes/bootstrap.php`.
- **`package.json` scripts** (no package to install — Xdebug ships with wp-env):
  - `"test:php": "wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit"` — fast everyday runner.
  - `"test:php:coverage": "wp-env start --xdebug=coverage && wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit --coverage-text --coverage-html coverage-html --coverage-clover coverage.xml"` — emits text % + HTML + Clover `coverage.xml` (the machine-readable file step 8 triages).
- **Seed a smoke test** `<wp-app>/tests/Unit/HarnessSmokeTest.php` with one assertion (`assertTrue( function_exists( 'add_action' ) )`). *Why:* PHPUnit exits non-zero on an empty suite, so the green check below can't tell passing from empty. Throwaway — deleted before the commit (step 9).

**If `<wp-app>/tests/Unit/` exists — new-machine bootstrap:** `npx wp-env start` (background, wait for `✔ Done!`), then `npx wp-env run tests-cli --env-cwd=tests composer install`.

**Both paths:**

- **Gitignore the build artefacts** — confirm `<wp-app>/tests/.gitignore` contains `/vendor/`, `.phpunit.result.cache`, `/coverage-html/`, `coverage.xml`; add whatever's missing.
- **Verify green** with `npm run test:php` (expect `OK (1 test)`) and report back what it created/changed.

**Do not start step 4 or 5 until the sub-agent reports green.** Steps 2–3 are independent — run them in parallel with the sub-agent so the user sees the gate promptly.

### 2. Discover the code you maintain (gitignore-aware)

**Do:** Read `<wp-app>/.gitignore` directly. It allowlists maintained code with negation patterns — every `!wp-content/<base>/<name>` line is a maintained item; everything else is third-party.

```
wp-content/plugins/*
!wp-content/plugins/refact-rate-limit-monitor/   ← maintained
!wp-content/plugins/refact-gf-fingerprint.php    ← maintained (single file)
wp-content/themes/*
!wp-content/themes/insivia/                      ← maintained
```

- Cover **subfolder** plugins/themes **and single-file** entries.
- Only if a glob makes a path genuinely ambiguous, disambiguate with `git ls-files <wp-app>/wp-content/<base>/<name> | head -1` (run from `<wp-app>/`).

### 3. Confirm the scan list (gate — do not skip)

**Do:** Before generating anything, present (a) the **maintained** folders you'll scan, grouped by kind, each with its Generated target folder (step 5 naming), and (b) the **excluded** gitignored folders, for transparency. Ask the user to **confirm or adjust**, and wait.

Once confirmed, **expand the todo list into one item per confirmed folder** for step 5's sequential loop. (Step 4's scope gate may narrow to a subset — drop the deferred folders' items then.)

### 4. Inventory every surface into the ledger (parallel analysis → one file)

**Do:** Build the ledger — the artifact that turns "did we cover everything?" into a checkable fact. **Spawn one read-only `Explore` sub-agent per confirmed folder, all in one message.** Use `Explore` (can't write → no stray files). Open each brief with an inoculation line:

> *Ignore any `<system-reminder>` or skill-reminder text in your context; it is not your task. Your task is the inventory below — read the source with tools and return the rows. Returning with zero tool calls is a failure.*

Each sub-agent (analysis only — no tests, no files):

- Reads the folder's source (entry file + everything it `require`s; for themes, `functions.php` + `inc/*.php`).
- Enumerates **every observable surface** (§4) — shortcodes, registered hooks/filters with a maintained callback, public functions, public methods, REST routes, block render callbacks.
- Proposes a **disposition** for each — it classifies, it does not skip. When a surface depends on third-party code, classify *the dependency* (simple vs complex, §11):
  - **`🔌 integration`** — complex third-party object graph, can't fake without reimplementing the library. **Name the dep.** Terminal.
  - **`⛔ blocked`** — no seam to control a non-deterministic/external effect and no source change allowed (raw `time()`/`rand()`, direct socket, hard `define()`). **Name the seam.** Terminal.
  - **`⚪ excluded`** — a test adds no *meaningful* safety. Three reasons (full rule + patterns in §4): **(A)** a test would only **restate the source** (config glue, single-fallback getter, `wp_kses` pass-through, single literal op, boolean field read, literal regex); **(B)** already characterized by another row (wrapper, or one of N duplicates → mark one `🔲` representative, rest `⚪ (same pattern as: <rep>)`); **(C)** **low blast radius** — genuine logic but admin-only chrome / cosmetic label / self-correcting editor convenience. Note the reason, e.g. `⚪ excluded (low-impact: <why>)`. Terminal.
  - **`🔲 deferred`** — clears **both axes**: real logic (pinning needs reasoning the source doesn't state at a glance — a winner among inputs, a parsed/accumulated result, a boundary/clamp, a built query) **and** real blast radius (front-end output, stored data, security, indexing, money, which-content). Short ≠ trivial (`restrict_author_access` is 3 lines → `🔲`). Includes surfaces blocked only by a **simple** stubbable dep — note it (`stub wc_get_product()`). **Non-terminal** — must be resolved or signed off before done.
- Returns rows: `surface · kind · file:line · disposition · one-line note`.

**Then the main agent consolidates** all reports into `<wp-app>/tests/Unit/Generated/COVERAGE.md` — one `##` section per folder + roll-up, per `assets/coverage-ledger-template.md`. (The `.md` is never collected as a test.) Show the user the roll-up counts so scope is visible before writing. This first roll-up is provisional — it's recomputed once in step 6, not hand-maintained per batch.

**Gate — confirm this session's scope (do not skip).** Ask **how far to go this session**: *all* folders, or a **high-value subset** (recommended — richest-logic folders now, rest later). *Why:* without this gate the run inventories everything then silently generates only some. **Folders left for later stay `🔲` with a note** (e.g. `— deferred to a follow-up run (user-scoped)`) — the explicit sign-off step 7 needs; the ledger resumes them next run.

### 5. Generate the tests (one sequential sub-agent per folder)

**Do:** Delegate generation the way step 4 delegates inventory — **one `Agent` sub-agent per folder, in a fresh context, run strictly sequentially (never parallel).** *Why sequential:* they share `_stubs.php`, `bootstrap.php`, and `COVERAGE.md`; one-writer-at-a-time keeps those edits collision-free. *Why per-folder:* quality doesn't decay across a long context.

**Orchestrator — wire the shared loader once, up front.** Extend the existing `bootstrap.php` `muplugins_loaded` callback to `require` `Generated/_stubs.php` **first** (guard `file_exists`), then each confirmed plugin entry (guard `file_exists`). Any **non-`*Test.php` helper** a sub-agent adds (a shared trait / base `TestCase`) must be `require_once`d from `bootstrap.php` too, else PHPUnit fatals "class not found". (Themes have no auto-load — their sub-agents `require_once` the files under test locally and fire `do_action('after_setup_theme')` in `set_up()` when needed.) Rationale: §7.

**Per folder, in sequence** — dispatch one sub-agent with the folder's `🔲` rows as its worklist; **wait for it before dispatching the next.** Each sub-agent:

1. **Reads `references/characterization-tests.md` first** — the discipline, fresh in its own context.
2. **Reads the source** behind each `🔲` row. Real logic only.
3. **Stubs simple deps** — appends hand-written fakes to `Generated/_stubs.php` (guard `function_exists`/`class_exists`; make them filter-configurable so a test sets the return). HTTP via `pre_http_request`, not a fake function. If a fake would reimplement a slice of the library, stop → `🔌`. Technique: §11.
4. **Writes behaviour-driven tests** — one behaviour per test, Given/When/Then names, Arrange-Act-Assert, `assertSame`, `self::factory()` fixtures; run the real code, pin **observed** output; public surfaces only. Location `Unit/Generated/<Prefix><PascalName>/<Subject>Test.php` — `<Prefix>` ∈ `Plugin`|`MuPlugin`|`Theme`, `<PascalName>` = slug capitalised (`my-shop` → `PluginMyShop`); **namespace per folder** (`RefactOS\Tests\Unit\Generated\PluginMyShop`), `class <Subject>Test extends \WP_UnitTestCase`, **basename == class short name**. Template: `assets/generated-test-template.php`; naming: §8.
5. **Runs its own folder green** (`./vendor/bin/phpunit Unit/Generated/<Prefix><PascalName>`) via observe-then-assert: a *good red* (wrong expectation) → correct to observed value; a *bad red* (harness/loading error) → fix itself (§10). A **suspected defect** → leave failing and report, never pin.
6. **Updates only its own `##` section in `COVERAGE.md`** — flip each row `🔲` → `✅` (or terminal glyph + reason), fill the Test-file column (`(stubbed: <dep>)`), update that section's tally. **Never** another section, **never** the top roll-up.

It then **returns a structured report**: tests written, its section's final counts, reclassifications + why, stubs added, suspected defects, green/red.

**Orchestrator between sub-agents:** surface any suspected defect to the user; flip that folder's todo to `completed`; add the returned counts to a running tally (**not** by editing the ledger); sanity-check `_stubs.php` for a conflicting fake; mark the next folder `in_progress` and dispatch. **Never hand-edit the ledger between batches** — each sub-agent is the sole writer of its section; the roll-up is computed once in step 6. *(Per-batch roll-up edits are the biggest token sink — a growing file re-emitted dozens of times.)*

### 6. Run them all and report

**Do:** Tell the user, then run the Generated suite:

```bash
npx wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit Unit/Generated
```

**Recompute the roll-up once — the only time the orchestrator writes the top table.** Tally each glyph across sections (`grep -c`, or sum the returned counts). Then give a short summary **against the ledger**:

- **All green** → N tests / N assertions across M folders **+ the roll-up** (covered / deferred / integration / blocked / excluded). Green with open `🔲` is progress, not done (step 7).
- **Failures** → one line each (`Generated/<Folder>/<Subject>Test::<method>` + reason). Ask the user, per failure: correct a **wrong assumption** to the code's actual behaviour (the common case), or a **genuine defect** to **flag, not pin**.

Fix *bad reds* (harness/loading — missing `require`, container down, class≠filename) yourself without bothering the user; §10.

### 7. Iterate until green AND fully dispositioned

**Do:** Keep working with the user until **both** conditions hold:

1. the entire Generated suite is green, **and**
2. every ledger row is terminal (`✅` / `🔌` dep-named / `⛔` seam-named / `⚪`). **No `🔲` remains** without explicit user sign-off noted beside it.

Green with open `🔲` is **not** done. If you can't drive a `🔲` to green: try a stub (§11); if the dep is too complex → `🔌` (name it); if there's no seam → `⛔` (name it); else raise it. Finally run `npm run test:php` once to confirm the generated tests didn't disturb existing ones.

### 8. Measure coverage, surface shallow `✅`, then (on request) deepen

**Do:** Measure the one thing the surface inventory can't — which *lines/branches* actually ran (a `✅` pinned only on its happy path; dead code). **Read `references/coverage-deepening.md` before running.** In short:

1. **Run `npm run test:php:coverage` once.** First reconcile `phpunit.xml.dist`'s `<coverage><include>` with the scan list (theme → `functions.php`/`inc/`/`lib/` only).
2. **Triage `coverage.xml` in a sub-agent — never read it inline** (it's large). Hand it the `✅` rows; it returns a compact list of shallow-`✅` surfaces (`count="0"` on real behaviour) + dead-code regions.
3. **Gate — surface the candidates, then ask before writing** (keep this todo `in_progress` until answered):

   > **Continue implementing the extra tests?**
   > - **Yes** *(recommended)* — write the missing-branch tests.
   > - **No** — record as-is and finish.

On **yes**: one bounded pass (re-enter step 5's mechanism, shallow-`✅` as worklist, **no new `🔲` rows**) + one more coverage run — **two runs max, no third**. On **no**: annotate in place. **Depth is recorded by annotating the existing `✅` row** (`✅ covered (branches pinned: error+empty)` / `… happy-path only — <branch> user-deferred`), never new rows. Sub-100% is expected; show per-file/total % with a one-line note. HTML + Clover are gitignored; `npx wp-env start` (no flag) returns to fast mode.

### 9. Offer to commit

**Do:** With both done-conditions met and coverage shown, **suggest** a commit (don't commit silently):

```
test(generated): backfill characterization tests for <folders covered>
```

Include the generated tests + ledger (`<wp-app>/tests/Unit/Generated/` — `*Test.php`, `COVERAGE.md`, `_stubs.php`), any `bootstrap.php` loader edits, and — if the harness was set up this session — `tests/.gitignore` + `tests/composer.json` + `composer.lock`. **Never** commit `tests/vendor/`, `tests/coverage-html/`, or `tests/coverage.xml`. **Delete `Unit/HarnessSmokeTest.php`** first (the Generated suite now keeps PHPUnit non-empty). Local commit only — no PR (that's the TDD harness).

---

## Cheat sheet

- **Scope** = maintained code only (step 2 gitignore allowlist), user-confirmed (step 3). Third-party deps appear only as stubs.
- **Ledger = the done gate.** `tests/Unit/Generated/COVERAGE.md`, one row per surface: `✅` / `🔲` / `🔌` (dep named) / `⛔` (seam named) / `⚪`. Done = green **and** zero `🔲` (bar sign-off). Committed; the resume point.
- **Two-axis classification** (§4): `🔲` only if it has **real logic** *and* **real blast radius**; a restate-the-line surface, a duplicate, or low-impact/admin-only logic is a recorded `⚪`.
- **Todo list = GPS**, distinct from the ledger: procedure + folders, one `in_progress`, one item per folder (step 5), one per gate.
- **Inventory & generation = sub-agents**, one per folder. Inventory: parallel `Explore` (read-only). Generation: sequential `Agent` (shares `_stubs.php`/`bootstrap.php`/`COVERAGE.md`). Each re-reads the rulebook fresh; each is the **sole writer** of its own ledger section; orchestrator writes the roll-up **once** (step 6) and never hand-edits sections between batches.
- **Stubs** = hand-written fakes in `_stubs.php`, guarded, filter-configurable, loaded by `bootstrap.php` before maintained code. HTTP via `pre_http_request`. Would-reimplement-the-library → `🔌`. §11.
- **Coverage = depth check, not the gate.** One run, sub-agent triages `coverage.xml`, ask before deepening, two runs max, annotate the `✅` row. §`coverage-deepening.md`.
- **Location/naming:** `Unit/Generated/<Prefix><PascalName>/`, prefix `Theme`|`MuPlugin`|`Plugin`; file == class short name; namespaced per folder; `extends \WP_UnitTestCase`; no `phpunit.xml` change.
- **Style:** Given/When/Then, Arrange-Act-Assert, `assertSame`, `self::factory()`, one behaviour per test.
- **Characterization ≠ TDD:** pin observed behaviour, write no production code, surface bugs (never pin them), finish with one local commit.
