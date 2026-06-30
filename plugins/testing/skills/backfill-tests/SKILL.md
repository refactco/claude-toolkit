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

The TDD harness (`tdd` → `tdd-plan` → `red-green-refactor`) drives **new** code test-first: the failing test comes before the code. This skill is its complement. The code already exists — it was written before TDD, and you want a safety net under it. So instead of driving design, you **characterize** the code's current observable behaviour and pin it with behaviour-driven unit tests. The result is a regression suite that lets the code be changed (or migrated to TDD) with confidence.


## What this skill does NOT do

- It does **not** modify the code under test. You write tests *around* existing behaviour; you don't refactor or fix it (if a test exposes a bug, surface it — don't silently pin it; see step 6).
- It does **not** slice features or open a PR. That's the TDD harness's job. This skill ends once the generated suite is green, the ledger is fully dispositioned, code coverage has been shown, and a commit has been offered (step 9).
- It does **not** test third-party code, modify it, or load it. Gitignored plugins/themes are vendor code you don't maintain — they are never the *subject* under test and are never scanned for surfaces. It **does**, however, *stub* the simple third-party dependencies your own code calls — hand-written fakes, no external mocking libraries — so a surface that calls them can still be characterized. You always assert on **your** code's behaviour, never the library's. A **complex** dependency (deep object graph, interconnected classes) is *not* faked: faking it would reimplement a chunk of someone else's library, so it is flagged `🔌 integration` for a separate integration suite this skill does **not** build. The decision rule and techniques are in `references/characterization-tests.md` §11.

## Procedure

### 1. Set up / verify the test harness (delegate to a sub-agent)

First, locate the **WordPress app directory** (`<wp-app>` below). Detect it from the repo (the folder holding `.wp-env.json` / `wp-content/`, e.g. `apps/wordpress` in a wp-env monorepo), or read it from `.refact-os.json` if present; if it is unclear, **ask the user**. Everything in this skill is relative to that directory.

Detection is then a **single check**: does `<wp-app>/tests/Unit/` exist? Don't hunt — there is exactly one tests directory and it is at the WordPress project root.

Setup is noisy (Docker, a ~10-minute first `wp-env start`, container `composer install`), so **delegate it to a sub-agent** (the `Agent` tool) to keep this context clean. Instruct the sub-agent to:

- **If `<wp-app>/tests/Unit/` is absent**, scaffold the harness:
  - Add `"tests": "./<wp-app>/tests"` to `mappings` in `.wp-env.json`; set `"testsEnvironment": true`; add a unique `"testsPort"` if needed to avoid a port conflict with the dev instance (which runs on the `"port"` value).
  - Create `<wp-app>/tests/phpunit.xml.dist` (PHPUnit 9, `bootstrap="bootstrap.php"`, testsuite directory `Unit/` with suffix `Test.php`). **Add a `<coverage processUncoveredFiles="true">` block** that scopes coverage to maintained source *only* — an `<include>` listing each maintained **plugin** as `<directory suffix=".php">../wp-content/<base>/<slug></directory>` (and any single-file plugin as `<file>../wp-content/plugins/<file>.php</file>`); paths are relative to `tests/`. **For a theme, include only its logic dirs** — `<file>../wp-content/themes/<slug>/functions.php</file>` plus `<directory suffix=".php">../wp-content/themes/<slug>/inc</directory>` and `…/lib` — **never the whole theme folder:** `processUncoveredFiles="true"` makes PHPUnit *load* every included file to measure it, and a theme's template/view files (`header.php`, `page-*.php`, …) fatal when loaded standalone because they call parent-theme/plugin globals. Scoping is essential — without it the report measures WordPress core and vendor and the % is meaningless — and `processUncoveredFiles="true"` keeps a file that has no tests in the denominator, so it lowers the number honestly instead of vanishing. (The folder list is reconciled against the confirmed scan list in step 8.)
  - Create `<wp-app>/tests/composer.json` pinning `phpunit/phpunit: ^9.6` and `yoast/phpunit-polyfills: ^1.1`.
  - Create `<wp-app>/tests/bootstrap.php`: (1) load the polyfills autoload from `vendor/yoast/phpunit-polyfills/phpunitpolyfills-autoload.php`, (2) require `$_tests_dir/includes/functions.php` so `tests_add_filter()` is available **before** calling it, (3) register a `muplugins_loaded` filter to `require` each maintained plugin's entry file (guarded with `file_exists`), (4) require `$_tests_dir/includes/bootstrap.php`.
  - Add two `package.json` scripts: `"test:php": "wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit"` (fast, no coverage — the everyday runner) and `"test:php:coverage": "wp-env start --xdebug=coverage && wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit --coverage-text --coverage-html coverage-html --coverage-clover coverage.xml"` (enables wp-env's bundled Xdebug in coverage mode, then emits three reports: a text summary to stdout, a browsable HTML report to `tests/coverage-html/`, and **Clover XML to `tests/coverage.xml`** — the machine-readable per-line hit data the agent triages in step 8). There is **no package to install** — the coverage driver ships with wp-env; it only needs the `--xdebug=coverage` start flag, which the script supplies.
  - **Seed one smoke test so the suite isn't empty.** A freshly-scaffolded harness has zero tests, and PHPUnit exits **non-zero** on an empty suite (`No tests executed` / `Error: No tests found`) — so the green check below can't tell *passing* from *empty*. Create `<wp-app>/tests/Unit/HarnessSmokeTest.php` with a single assertion (`assertTrue( function_exists( 'add_action' ) )`) so `npm run test:php` returns a clean `OK (1 test, 1 assertion)`. It's a throwaway: once the first Generated tests exist it can be deleted, and it is **not** part of the backfill commit (step 9).
- **If `<wp-app>/tests/Unit/` exists**, do the new-machine bootstrap: run `npx wp-env start` in the background and wait for `✔ Done!`, then `npx wp-env run tests-cli --env-cwd=tests composer install`.
- **Guarantee the build artefacts are gitignored.** `composer install` creates `<wp-app>/tests/vendor/`, the runner creates `.phpunit.result.cache`, and the coverage run creates `<wp-app>/tests/coverage-html/` and `<wp-app>/tests/coverage.xml` — **none must ever be committed**. Confirm `<wp-app>/tests/.gitignore` exists and contains `/vendor/`, `.phpunit.result.cache`, `/coverage-html/`, and `coverage.xml`; **add whichever is missing.** Check this on both paths — the harness may predate the convention.
- **Verify green** with `npm run test:php` — with the smoke test seeded this is an unambiguous `OK (1 test)`, not an empty-suite non-zero exit — and report back the result (and any files it created or changed).

Do not proceed to **step 4 (inventory) or step 5 (writing tests)** until the sub-agent reports the harness is green. Steps 2 and 3 (discovery and scan-list confirmation) are independent — run them in parallel with the sub-agent so the user sees the gate promptly.

### 2. Discover the code you maintain (gitignore-aware)

From `<wp-app>`, discover maintained code by **reading `<wp-app>/.gitignore` directly** — it uses negation patterns to explicitly allowlist everything the team owns:

```
wp-content/plugins/*
!wp-content/plugins/refact-rate-limit-monitor/   ← maintained
!wp-content/plugins/refact-gf-fingerprint.php    ← maintained (single file)
...
wp-content/themes/*
!wp-content/themes/insivia/                      ← maintained
```

Every `!wp-content/<base>/<name>` line is a maintained item; everything else is third-party. This is faster and more reliable than a `git check-ignore` loop, which must run from `<wp-app>/` (not the repo root) or it queries the wrong `.gitignore`.

- Cover **subfolder** plugins/themes *and* **single-file** entries (e.g. `refact-gf-fingerprint.php` directly under `plugins/`).
- Use `git ls-files <wp-app>/wp-content/<base>/<name> | head -1` only if a candidate's status is genuinely ambiguous (e.g. the `.gitignore` uses a glob and you're unsure whether a specific path is covered).
- The one-tests-directory rule ("never hunt for a tests folder") applies to locating the **test harness**. Discovering the **source under test** is exactly what this step is for — different purpose.

### 3. Confirm the scan list with the user (gate — do not skip)

Present, before generating anything:

- the **maintained** folders you will scan, grouped by kind, each with the Generated target folder it will map to (step 5's naming), and
- the **excluded** (gitignored) folders, for transparency.

Then ask the user to **confirm or adjust** — they may add a folder you missed or exclude one you found. Wait for their confirmation. No tests are written before this gate.

### 4. Inventory every surface into the coverage ledger (parallel analysis → one file)

Before writing any test, build a **coverage ledger** — the one artifact that turns "did we cover everything?" from a judgement call into a checkable fact. This is the step that stops the skill finishing with reachable surfaces silently untested.

**Analyse the confirmed folders in parallel.** Spawn **one sub-agent per confirmed folder** (the `Agent` tool — issue them all in a single message so they run concurrently). Each sub-agent does **analysis only: it writes no tests and creates no files.** It:

- Reads the folder's source (the entry file + everything it `require`s; for themes, `functions.php` + `inc/*.php`).
- Enumerates **every observable surface** per `references/characterization-tests.md` §4 — shortcodes, registered hooks/filters whose callback is maintained code, public functions, public class methods, REST routes, block render callbacks.
- Proposes a **disposition** for each (it classifies; it does not get to skip). When a surface depends on third-party code, the sub-agent must classify *the dependency* — simple vs complex per `references/characterization-tests.md` §11 — to choose between `🔲` (stubbable), `🔌` (integration), and `⛔` (no seam):
  - `🔌 integration` — reachable, but it depends on a **complex** third-party object graph that can't be faked without reimplementing a chunk of the library; **name the dep** (`MeprUser` and its related objects, a full `WC_Order`/`WC_Cart` graph). Terminal — handed to a future integration suite this skill does not build.
  - `⛔ blocked` — untestable **as written** because there is no seam to control a non-deterministic or external effect, and this skill may not modify the source: raw `time()`/`rand()`, direct `curl`/socket calls not routed through the WP HTTP API, hard-coded `define()`/global state with no filter. **Name the seam.** (Needs a source change first — TDD-harness territory.)
  - `⚪ excluded` — trivial glue with no logic to pin (`register_*`, a pure getter, a config array).
  - `🔲 deferred` — reachable and carries real logic. **Everything that isn't `🔌`, `⛔`, or trivial starts here** — including a surface whose only obstacle is a **simple** third-party dependency (a value-returning function, a simple class method, an HTTP call), which is now coverable via a hand-written stub. Note the stub needed (`stub wc_get_product()`). Every `🔲` is work that must be done (or explicitly signed off) before the skill is finished.
- Returns its inventory as rows: surface · kind · `file:line` · proposed disposition · one-line note. (Analysis-only and read-heavy — `Explore` or a general sub-agent both fit; never let it write.)

**Consolidate into the ledger file.** When all sub-agents report, the **main agent** writes their inventory to:

```
<wp-app>/tests/Unit/Generated/COVERAGE.md
```

one `##` section per folder plus the roll-up, following `assets/coverage-ledger-template.md`. The `.md` is never collected as a test (the suite globs `*Test.php`), so it sits safely inside `Generated/`. It is **committed with the tests** (step 9): living documentation of *what is covered and why the rest isn't*, and on any **re-run** of this skill it is the resume point — read it first, work only the non-terminal rows.

Show the user the ledger (or just the roll-up counts: covered / deferred / integration / blocked / excluded per folder) so the scope of work is visible **before** you start writing. The 🔲 count is your worklist for step 5 and your definition of done for step 7.

### 5. Generate the tests (one sequential sub-agent per folder)

Generation is the step where a long, growing context quietly erodes test *quality* — later folders drift toward thinner assertions, lazier names, and copied patterns. So **delegate it the way step 4 delegates inventory: one sub-agent per maintained folder, each in a fresh context**, so a folder's tests are written with the same care whether it is the first folder or the tenth. Run them **strictly sequentially — never in parallel** — because they share three files (`_stubs.php`, `bootstrap.php`, `COVERAGE.md`); sequential execution is exactly what keeps those shared edits collision-free. Use a sub-agent that can **write files and run the harness** (the general `Agent` tool — *not* the read-only `Explore` type).

**Orchestrator — wire the shared loader once, before dispatching anything.** Extend the existing `tests/bootstrap.php` loader (the `tests_add_filter('muplugins_loaded', …)` callback) to `require` `Generated/_stubs.php` **first** (guarded with `file_exists`, since early runs have no stubs yet) — so a fake is defined before any plugin checks `function_exists()` at load time — then `require` each confirmed plugin/mu-plugin entry file (guarded with `file_exists`). Don't create a second bootstrap; extend the existing loader. **Any shared helper a sub-agent adds that is _not_ a `*Test.php` file** — a trait or base class reused across a folder's tests (e.g. a `Loads<Theme>Trait`), a shared base `TestCase` — **must be `require_once`d from `bootstrap.php` too:** PHPUnit only autoloads files matching the `*Test.php` suffix, so an un-required helper trait/class fatals with "trait/class not found" on the first run. (**Themes** have no plugin-style auto-load, so their sub-agents `require_once` the specific files under test test-locally, firing `do_action('after_setup_theme')` in `setUp()` when the code needs it.) Rationale: `references/characterization-tests.md` §7.

**Per folder, in sequence — dispatch one generation sub-agent**, hand it the folder's `🔲 deferred` rows (its exact worklist) plus the brief below, and **wait for it to finish before dispatching the next.** Each sub-agent:

1. **Reads `references/characterization-tests.md` first.** Every sub-agent reads the rulebook fresh in its own context — *this is the point of the per-folder split*: the discipline (observe-then-assert, strict assertions, what to target, good-red vs bad-red) is always freshly in context, never decayed behind a long history.
2. **Reads the source** behind each `🔲` row for its *observable* surfaces — shortcodes, registered hooks/filters, public functions, public methods, REST routes, block render callbacks. Real logic only; skip trivial getters and framework glue.
3. **Stubs the simple third-party deps** the surface calls — hand-written fakes, no external libraries. A value-returning function (`wc_get_product()`, ACF `get_field()`), a simple class method, or an HTTP call is fair game: pin a canned return to exercise *your* logic around it. It **appends** its fakes to the shared `Generated/_stubs.php` (each guarded with `function_exists`/`class_exists`; safe because runs are sequential), configurable via a filter the test sets. Stub HTTP through `pre_http_request`, not a fake function. If faking a dep would reimplement a meaningful slice of the library, **stop** — that surface is `🔌 integration`, not a unit test. Full technique and the simple-vs-complex rule: §11.
4. **Writes behaviour-driven characterization tests** — one behaviour per test, `Given/When/Then` names, Arrange-Act-Assert bodies, `assertSame` (strict), `self::factory()` fixtures. Runs the real code (simple deps stubbed) and pins its **observed** output. INVEST at the test level; test through public surfaces, never private internals. Each file goes at `Unit/Generated/<Prefix><PascalName>/<Subject>Test.php` — `<Prefix>` ∈ `Plugin`|`MuPlugin`|`Theme`, `<PascalName>` = slug split on non-alphanumerics, each token capitalised (`my-shop` → `PluginMyShop`, `mu-plugins/core-logic` → `MuPluginCoreLogic`); **namespace per folder** (`namespace RefactOS\Tests\Unit\Generated\PluginMyShop;`), `class <Subject>Test extends \WP_UnitTestCase`, **basename == class short name**. No `phpunit.xml.dist` change — `./Unit` already recurses into `Generated/`. Template: `assets/generated-test-template.php`; naming detail: §8.
5. **Runs its own folder's suite green** (`./vendor/bin/phpunit Unit/Generated/<Prefix><PascalName>`) via observe-then-assert: on a failure, read the actual value and correct the expectation to the *observed* behaviour (a good red); fix harness/loading errors itself (a bad red — §10). It does **not** silently pin a **suspected defect** — it leaves it failing and reports it.
6. **Updates its own `##` section in `COVERAGE.md` in lockstep** — flip each row `🔲 deferred` → `✅ covered` (or `🔌`/`⛔`/`⚪` with a reason) as the test greens, filling the Test-file column (note `(stubbed: <dep>)` when a fake unblocked it). It touches **only its own section** — not other folders', not the roll-up.

It then **returns a structured report**: tests written, rows finalized with any reclassifications (and why), stubs it added, any suspected defects, and its green/red result.

**Orchestrator — between sub-agents.** When one returns: surface any **suspected defect** to the user (never pin it); refresh the `COVERAGE.md` roll-up counts from the updated sections; sanity-check `_stubs.php` for a duplicate or conflicting fake the new folder introduced. Then dispatch the next folder. Because nothing runs concurrently, each shared file has only one writer at a time.

### 6. Run them all and report (no confirmation needed)

Tell the user you're now running **all** the generated tests, then run the Generated suite:

```bash
npx wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit Unit/Generated
```

Then give a **short summary**, reported **against the ledger** (not just the green count):

- **All green** → report success: N tests / N assertions passing across the M folders, **plus the ledger roll-up** — covered / deferred / integration / blocked / excluded. A green suite with `🔲 deferred` rows still open is progress, not completion (see step 7).
- **Failures** → list each failing test as one line — `Generated/<Folder>/<Subject>Test::<method>` + the one-line reason (the assertion message). Then ask the user to review the failing tests and decide, per failure, whether **a wrong assumption** in the test should be corrected to the code's *actual* observed behaviour (the common case for characterization), or whether the failure reveals a **genuine defect** in the code — which you must **flag, not silently pin** (pinning a bug bakes it into the regression suite).

Distinguish a *good* red (your expected value simply didn't match the real behaviour → adjust the test) from a *bad* red (harness/loading error — missing `require`, container down, class-name ≠ filename) using the good-red vs bad-red guide in `references/characterization-tests.md` §10; fix bad reds without bothering the user.

### 7. Iterate until green AND the ledger is fully dispositioned

Keep working with the user — correcting expected values to the code's real behaviour, fixing loading/harness issues, surfacing any suspected defects — re-running after each change. **Done has two conditions, not one:**

1. the **entire Generated suite is green**, and
2. **every ledger row is terminal** — `✅ covered`, `🔌 integration` (complex dep named), `⛔ blocked` (seam named), or `⚪ excluded`. **No `🔲 deferred` row may remain** unless the user has explicitly signed off on deferring it (note the sign-off beside the row).

A green suite with open `🔲` rows is **not** done — that silent gap is exactly what the ledger exists to prevent. If you cannot drive a `🔲` to green, it is not deferred-by-default: try a hand-written stub first (§11); if the dep is too complex to fake, reclassify it `🔌 integration` (name the dep); if there is no seam to control the effect without a source change, reclassify it `⛔ blocked` (name the seam); otherwise raise it with the user. Then run the full suite (`npm run test:php`) once to confirm the generated tests didn't disturb the existing ones.

### 8. Measure coverage, then triage the gaps into tests or dispositions (before offering to commit)

With the suite green and the ledger fully dispositioned, **measure how much of the maintained source actually executes, then use the uncovered lines to find behaviour worth pinning that the surface inventory missed.** The ledger proves every *surface* was dispositioned (breadth); coverage shows which *lines/branches* actually ran (depth). A green suite over a fully-dispositioned ledger can still leave a whole error/boundary branch of a `✅` surface unexecuted — this step is where that surfaces.

**Run it.** The `test:php:coverage` script (step 1) enables wp-env's bundled Xdebug coverage driver and emits all three reports:

```bash
npm run test:php:coverage
# → wp-env start --xdebug=coverage && wp-env run tests-cli --env-cwd=tests \
#     ./vendor/bin/phpunit --coverage-text --coverage-html coverage-html --coverage-clover coverage.xml
```

First **reconcile `phpunit.xml.dist`'s `<coverage><include>` with the confirmed scan list** (step 3): it must list every maintained plugin/theme folder (single-file plugins via `<file>`) and **nothing else**. If it covers core/vendor the % is meaningless; if it omits a maintained folder that folder's gaps are invisible. **For a theme, scope to its logic dirs — `functions.php`, `inc/`, `lib/` — not the whole theme directory:** under `processUncoveredFiles="true"` PHPUnit loads every included file, and a theme's template/view files (`header.php`, `page-*.php`, …) fatal when loaded standalone (they call parent-theme/plugin globals). A coverage run that dies with a fatal inside a template file is this misconfiguration, not a test failure.

**Then triage — read the gaps, not the headline number.** The % is only a pointer; the actionable data is the set of unexecuted lines in `coverage.xml` (`<line ... count="0"/>`). Work it as a loop:

1. **Rank by risk, not by total.** Sort maintained files by *low coverage × logic density* — a branchy file at 45% is a louder signal than a flat helper at 70%. Ignore the aggregate %.
2. **Drill into the `count="0"` lines** of the top-ranked files, read that source, and decide what each uncovered region *is*.
3. **Classify each region with the ledger's own vocabulary** — a missed branch is just a finer-grained surface:
   - **reachable branch of an already-`✅` surface, carrying real behaviour** (you pinned the happy path; the empty/error/boundary path never ran) → **loop back to step 5 and write the missing-branch test**, then re-run. This is the main way this step adds tests.
   - only reachable through a **complex** third-party object graph → confirm it's already `🔌 integration` and leave it.
   - gated by a non-deterministic/external effect with **no seam** (and no source change allowed here) → `⛔ blocked`; the red line *confirms* you couldn't reach it.
   - trivial guard / glue → `⚪ excluded`.
   - **not reachable from any public surface at all** → a **dead-code** signal the surface inventory structurally can't find — surface it to the user (same handling as a suspected defect, step 6 / reference §10). Do **not** write a test to reach it.
4. **Reconcile against the ledger.** The discrepancy worth reconsidering is a region **uncovered but whose surface is marked `✅ covered`** — breadth said done, depth disagrees. Resolve every such row: add the branch test, or annotate why the branch is unreachable and re-disposition it.

**The honest stop.** Every gap resolves to *either* a new test *or* a recorded disposition — **never an ignored red line, and never a test written just to turn a line green** (that yields contrived, assertion-thin tests, the opposite of a safety net). Adding a test here re-opens the step 7 done-gate: keep looping (write → re-green → re-disposition → re-measure) until you are *choosing* to leave each remaining gap. Coverage never replaces the ledger as the gate — it feeds the ledger candidates. This is also what operationalizes `references/characterization-tests.md` §4 ("exhaustive at the surface level, not the branch level"): coverage *shows* you which load-bearing branch deserves a second pass instead of you guessing.

**Display the result.** Show the user the `--coverage-text` per-file and total line % alongside the ledger roll-up, plus a one-line note of what the triage changed — tests added, rows re-dispositioned, any dead code flagged. Sub-100% is expected, not a failure. Append `Unit/Generated` to the command to isolate the backfill suite's own contribution if the project also has pre-existing tests.

The HTML report (`tests/coverage-html/`) and Clover XML (`tests/coverage.xml`) are build artefacts — gitignored (step 1), **never committed**. Coverage mode slows the suite; `npx wp-env start` (no flag) returns it to fast mode for everyday `npm run test:php` runs.

### 9. Offer to commit (once everything is green and the ledger is dispositioned)

With both done-conditions met and coverage shown, **suggest the user commit the new safety net** — don't commit silently. Propose a single Conventional Commit and let them confirm:

```
test(generated): backfill characterization tests for <folders covered>
```

Include in the suggested commit the generated tests **and the ledger** (`<wp-app>/tests/Unit/Generated/` — the `*Test.php` files, `COVERAGE.md`, and `_stubs.php` if any stubs were written), any `bootstrap.php` loader edits that made the code under test loadable, and — if the harness was set up this session — the `tests/.gitignore` and `tests/composer.json` + `composer.lock` (never `tests/vendor/`, `tests/coverage-html/`, or `tests/coverage.xml`). If you seeded `Unit/HarnessSmokeTest.php` during setup (step 1), **delete it before committing** — the Generated suite now keeps PHPUnit non-empty, so the throwaway has served its purpose. Committing `COVERAGE.md` is what makes the next run resumable. This is a local commit only; opening a PR stays out of scope (that's the TDD harness's job).

## Conventions (quick reference)

- **Scope = maintained code only.** Gitignored plugins/themes are never scanned or tested. The user confirms the list before any generation. Third-party deps your code *calls* are in play only as **stubs** (see next bullet) — never as a test subject.
- **Coverage ledger = the done gate.** After the scan list is confirmed, parallel sub‑agents inventory every surface. Their reports go into `tests/Unit/Generated/COVERAGE.md` (template: `assets/coverage-ledger-template.md`), written by the subagent. Each surface is `✅ covered` / `🔲 deferred` / `🔌 integration` (complex dep named) / `⛔ blocked` (seam named) / `⚪ excluded`. Done = suite green **and** zero `🔲` rows (bar explicit user sign-off). Committed with the tests; the resume point on re-run.
- **Generation = one sequential sub-agent per folder.** Test-writing is delegated like inventory — a fresh-context sub-agent per maintained folder, run **sequentially** (they share `_stubs.php`/`bootstrap.php`/`COVERAGE.md`) and each re-reading the rulebook fresh, so quality doesn't drift across a long run. The orchestrator wires `bootstrap.php` once up front, surfaces suspected defects, and keeps the roll-up; each sub-agent owns its folder's tests, its appended stubs, and its own `COVERAGE.md` section. Step 8 coverage re-checks re-enter the same way.
- **Code coverage = the depth check, not the gate.** After the suite is green and the ledger dispositioned (step 8, before commit), `npm run test:php:coverage` enables wp-env's bundled Xdebug coverage mode and emits line % + HTML + Clover XML for the **maintained source only** (scoped via `phpunit.xml.dist`'s `<coverage><include>`, reconciled with the confirmed scan list — themes to logic dirs only, never the whole theme folder). The agent **triages the `count="0"` lines** in `coverage.xml`, not the headline %: each uncovered region becomes *either* a new branch test (loop back to step 5) *or* a recorded disposition (`🔌`/`⛔`/`⚪`) — never an ignored red line, never a test written just to green a line. A region uncovered under a surface already marked `✅` is the discrepancy to reconsider; a region unreachable from any public surface is a dead-code signal to surface. Sub-100% is expected (exhaustive at the surface level, not the branch level). HTML + Clover are build artefacts — `coverage-html/` and `coverage.xml` gitignored, never committed; nothing to install.
- **Stubs = hand-written fakes, no external libs.** A **simple** third-party dep (value-returning function, simple class method, HTTP via `pre_http_request`) gets a configurable fake in `tests/Unit/Generated/_stubs.php`, loaded by `bootstrap.php` before maintained code and guarded with `function_exists`/`class_exists`. Rule of thumb: if a fake would reimplement a meaningful slice of the library, don't — flag it `🔌 integration`. You stub to test *your* code; you never assert the library's own behaviour. Full technique in `references/characterization-tests.md` §11.
- **Location:** `<wp-app>/tests/Unit/Generated/<Prefix><PascalName>/`. Prefix `Theme` | `MuPlugin` | `Plugin`; name in PascalCase. One folder per source folder.
- **File == class short name**, classes **namespaced** per folder, `extends \WP_UnitTestCase`. No phpunit.xml change.
- **Style:** behaviour-driven (Given/When/Then), Arrange-Act-Assert, `assertSame`, `self::factory()` fixtures, one behaviour per test, INVEST at the test level — same characteristics the TDD skills enforce, applied to existing code.
- **Characterization ≠ TDD:** the code already exists, so you pin observed behaviour rather than drive design — you do **not** write production code or slice features. A test that exposes a bug is surfaced to the user, not used to pin the bug. You finish by offering a single local commit (step 9).
