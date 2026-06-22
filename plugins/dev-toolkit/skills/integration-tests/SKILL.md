---
name: integration-tests
description: Decide which surfaces backfill-tests flagged 🔌 integration are worth a real integration test, then build a real-plugin integration suite for those that pass the gate. Trigger on '/integration-tests', 'integration tests'.
pattern: procedure
when_to_use: backfill-tests left surfaces marked 🔌 integration — reachable code whose correctness depends on a complex third-party object graph (a full WC_Order/WC_Cart, a MeprUser and its subscriptions) that couldn't be faithfully stubbed — and you want to decide which of those deserve a real integration test and build them. "/integration-tests", "integration tests", "are integration tests worth it here", "cover the 🔌 rows", "test this against the real plugin".
when_not_to_use: A surface a hand-written stub can fake faithfully (that's backfill-tests' unit job — simple value-returning dep). Driving NEW code test-first (the TDD harness). A surface marked ⛔ blocked (no seam — needs a source change first, not an integration test). Asserting the third-party library's OWN behaviour (you always test YOUR code through the real dependency, never the library itself). Third-party / gitignored plugins as the subject under test.
next_skills: []
sub_agents: []
---

# Integration Tests — Decide What's Worth It, Then Build It

The `backfill-tests` skill characterizes maintained WordPress code with **unit** tests. When a surface's correctness depends on a **complex** third-party object graph — a full `WC_Cart` with line items, coupons, taxes; a `MeprUser` and its transaction/subscription objects — backfill refuses to fake it (a faithful fake would reimplement a chunk of the library) and marks it `🔌 integration`, deferring it to "a separate integration suite this skill does not build."

**This is that skill.** Its input is the `🔌 integration` rows in backfill's `COVERAGE.md`. But it does **not** blindly write an integration test for every one — integration tests are slow, need the real plugin present, and flake more, so building them indiscriminately produces a brittle suite nobody trusts. The heart of this skill is a **decision gate** (step 2): *which `🔌` surfaces is integration testing actually worth it for?* Only the ones that pass the gate get built. The rest are deferred with a reason and a cheaper alternative noted (a contract test, a staging/manual check).

The relationship to the test family:
- `tdd` → `tdd-plan` → `red-green-refactor` — drives **new** code test-first.
- `backfill-tests` — pins **existing** code with **unit** tests; stubs *simple* deps; defers *complex*-dep surfaces as `🔌 integration`.
- **`integration-tests`** (this skill) — picks up those `🔌` rows, decides which are worth it, and pins the survivors with **integration** tests that run your code against the **real** third-party plugin.

## What this skill does NOT do

- It does **not** modify the code under test. Like backfill, it pins **observed** behaviour around existing code; if a test exposes a bug, surface it — don't silently pin it.
- It does **not** test the third-party library. You activate the real plugin so the *interaction* is real, but every assertion is on **your** code's observable output, never WooCommerce's or MemberPress's own correctness.
- It does **not** re-scan the codebase for surfaces. backfill already did the surface inventory; this skill's candidate pool is exactly the `🔌 integration` rows in `COVERAGE.md` (plus any surface the user names directly). Re-scanning is wasted work.
- It does **not** build an integration test for every `🔌` row. The decision gate (step 2) is the whole point — a `🔌` flag means "couldn't unit-test it," **not** "must integration-test it."

## Procedure

### 1. Locate the candidate pool — the `🔌 integration` rows

The input is backfill's ledger:

```
apps/wordpress/tests/Unit/Generated/COVERAGE.md
```

Read it and collect every row whose disposition is `🔌 integration`. Each such row already names the complex dependency in its Notes (`complex MeprUser object graph`, `full WC_Cart`) — that naming is what makes triage possible.

- **If `COVERAGE.md` exists**: the `🔌` rows are your candidate pool. Note their count and the deps named.
- **If it does not exist**: the entry condition isn't met. Tell the user the natural order is `backfill-tests` first (it inventories surfaces and flags the `🔌` ones), then this skill. You may still proceed for a **specific surface the user names** — treat it as a one-row pool and apply the same gate — but don't invent a surface inventory here; that's backfill's job.

This skill maintains its **own** ledger, the triage table (step 2). It also **cross-references back** into `COVERAGE.md` when a row gets covered (step 8), so backfill's ledger stays honest about what the integration suite picked up.

### 2. Triage each `🔌` row through the decision gate (the heart of this skill)

A `🔌` flag means a hand-written stub couldn't fake the dependency faithfully. That is **necessary but not sufficient** for an integration test to be worth building. Run each row through the gate below.

**The core principle.** A `🔌` flag already establishes that **a faithful unit stub is impossible** — that's *why* backfill couldn't unit-test it. The decision gate does **not** re-assess that. It asks only the one thing backfill didn't: **does a silent break have real cost?** — is the surface load-bearing (money, data integrity, access control, a customer-visible flow), or is it cosmetic? A slow, real-dependency test earns its keep only when the answer is yes; for cosmetic output it doesn't, even though the stub was impossible.

**First, detect availability yourself with `wp-cli` — never ask the user "is X active?".** The build-vs-contract lookup hinges on whether each named dep is present and active in the WordPress install — and that's a fact you read, not a question to put to the user. You only need the **specific deps the `🔌` rows name**, not the whole site, so do this up front, before any prompting:

1. **Collect the distinct deps** named across all `🔌` rows and map each to a slug — usually a **plugin** (`MeprUser`→`memberpress`, `WC_Cart`/`WC_Order`→`woocommerce`, a Gravity Forms entry→`gravityforms`, ACF `get_field()`→`advanced-custom-fields[-pro]`), occasionally a **theme** (a child theme's surface depending on its parent theme → the parent-theme slug).
2. **Resolve each named dep's status** — plugins from `wp plugin list`, any theme dep from `wp theme list` (read once each; look the named deps up in the result):

```bash
npx wp-env run cli wp plugin list --fields=name,status,version
npx wp-env run cli wp theme list  --fields=name,status,version   # only if a 🔌 dep is a parent theme
```

Read each dep's **full** status, not a yes/no "is it active" — you need to tell **inactive** (activatable) from **not installed** (contract-only), because that's exactly what decides the prompt below.

Then resolve each dep **without a user round-trip wherever you can**:

- **Active** → available. Mark the dep runnable and move on — **ask nothing.** This is the common case the friction came from; a plugin confirmed active here never produces a question again (step 4 trusts this result).
- **Installed but inactive** → it *can* be tested, it just isn't on. Don't silently proceed and don't ask a yes/no — tell the user once (**batched** across every inactive plugin) and ask the only question worth asking: **activate it now, or drop that surface?** On "activate," you run it yourself — `npx wp-env run cli wp plugin activate <slug>` **and** `npx wp-env run tests-cli wp plugin activate <slug>` (the suite runs in the tests instance) — then treat it as available. On "drop," the surface is `🟡 contract` or `⚪ skip`.
- **Not installed** → it can't be exercised in the integration suite at all. Mark the surface `🟡 contract` (the honest fallback) by default and say so; only ask if the user wants to install/provide it.

The detection runs **once**, so even the activate-or-drop prompt is asked at most once per missing plugin — never per surface, never per row. Feed the resolved availability into the build-vs-contract lookup below.

**One judgment + one lookup.** The `🔌` flag already settled faithfulness, so the gate doesn't re-assess it. What's left is **one judgment** and **one fact you already read**:

- **The judgment — does a silent break have real cost?** Payment/checkout, membership/subscription gating, capability & access checks, DB/order/user-meta writes, anything irreversible or customer-visible → **keep it.** Cosmetic output, display glue, an admin convenience no money or access rides on → `⚪ skip`.
- **The lookup — does the dep run locally?** Already resolved by the `wp plugin list` / `wp theme list` step above (active / activated / not installed) — a fact, not research. It only splits a *kept* surface into `🟢 build` vs `🟡 contract`; it never rescues a no-cost surface.

**Verdict per `🔌` row:**

- `🟢 build` — real cost **and** the dep runs locally → real integration test (step 5).
- `🟡 contract` — real cost, but the dep **can't** run reproducibly on maintainers' machines (a license-gated extension nobody has locally, an external payment gateway, a SaaS with no sandbox). Pin a **contract test** instead: assert your code against a **recorded/representative shape** of the dependency's data (a captured `WC_Order` array, an HTTP fixture via `pre_http_request`) — cheaper, reproducible, catches *your* parsing/handling regressions even if it can't catch the library changing under you. Because it needs **no real plugin**, a contract test is **CI-safe**: write it into the **unit** suite (`tests/Unit/Generated/<Prefix><PascalName>/`, run by `test:php`), not the local-only `Integration/` tree. Note what real check covers the rest (staging/manual).
- `⚪ skip` — no real cost / cosmetic, or over-classified and belongs back in backfill as a simple **stub**. Note which.

**Judge from the `COVERAGE.md` row — don't re-read every source.** Each `🔌` row already names its surface, location, and the complex dep; that's usually enough to call blast radius directly. Only **read the source** (or delegate one read-only `Explore`) for the rows where "does a break here actually cost anything?" is genuinely ambiguous — there's **no mandatory per-row fan-out**. Consolidate the verdicts into the triage table (`assets/integration-triage-template.md`) written to:

```
apps/wordpress/tests/Integration/TRIAGE.md
```

### 3. Confirm the build list with the user (gate — do not skip)

This is the integration analogue of backfill's scan-list gate. Before building anything, present the triage table, then state the plan as a **default you'll act on** — not a quiz that makes the user adjudicate every row:

- the `🟢 build` rows — *"I'll build these as real integration tests,"*
- the `🟡 contract` rows — *"these I'll mock as contract tests"* (and **why** the real plugin can't run locally),
- the `⚪ skip` rows — *"these stay uncovered, or go back to backfill as a stub."*

End with the easy path: **"Say go and I'll build the greens and mock the yellows — or tell me what to change."** They can promote a `🟡`/`⚪` to `🟢` (they *do* have the plugin locally after all), demote a `🟢`, or send a row back to backfill — just by typing it. **Wait for the go-ahead. No tests are written before this gate.** This is where "is integration testing worth it?" gets *decided*, not just proposed.

### 4. Set up / verify the integration harness (delegate to a sub-agent)

Integration tests differ from backfill's unit harness in one decisive way: the **real third-party plugin must be loaded and activated**. Backfill's harness gitignores third-party plugins and never loads them (that's why complex deps couldn't be faked). This skill's harness does the opposite for the deps under test.

**This integration suite runs locally, on demand — never in CI.** The real plugins are often premium/license-gated, slow to install, and not something to ship into CI; so CI runs the fast unit suite (`test:php`) only, and the integration suite is a separate, opt-in `test:php:integration` a maintainer runs on their own machine. (The CI-safe half of this skill's output is the `🟡 contract` tests — they use no real plugin, so they live in the unit suite and *do* run in CI.)

Setup is noisy (the real plugins must install their DB tables on boot), so **delegate it to a sub-agent** (the `Agent` tool) to keep this context clean.

**Open the sub-agent's brief with the environment preamble — and reuse it verbatim for every step-5 build sub-agent too:** *the wp-env environment is already running, so do **not** run `wp-env start` (a second start collides on port 8888 and spins up a stray project hash that then has to be torn down by hand); run every `wp-env` / `npm` / `composer` command from the **repo root** (where `.wp-env.json` lives), never from `apps/wordpress` — `--env-cwd=tests` already resolves the tests dir relative to the root.* Sub-agents inherit a `cwd` of `apps/wordpress`, so without this line they guess the directory wrong and an `environment not initialized` error sends them down a `wp-env start` → port-collision → docker-cleanup detour.

Full mechanics are in `references/integration-tests.md`; in brief, the sub-agent:

- Adds a **second, separate** PHPUnit config `apps/wordpress/tests/phpunit-integration.xml.dist` (PHPUnit 9, `bootstrap="bootstrap-integration.php"`, testsuite directory `Integration/` with suffix `Test.php`). It is **separate from the unit config** so the fast unit suite never pays the integration cost and never needs the real plugins.
- Creates `apps/wordpress/tests/bootstrap-integration.php`: loads the polyfills + `$_tests_dir/includes/functions.php`, then on `muplugins_loaded` **requires the real third-party plugin entry files** (the ones backfill deliberately omits) **and** the maintained plugins, runs each plugin's installer/activation where it needs one (WooCommerce's `WC_Install`, MemberPress' table setup — see the reference's per-plugin notes), then requires `$_tests_dir/includes/bootstrap.php`.
- Adds a `package.json` script `"test:php:integration": "wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit -c phpunit-integration.xml.dist"` — opt-in, run **locally on demand, never wired into CI**; not part of the everyday `test:php` runner.
- **Trusts step 2's `wp-cli` availability result — it does not re-ask.** Step 2 already established (via `wp plugin list`, activating where the user agreed) that each `🟢 build` plugin is active; this step only wires the tests instance to actually *load* it. The plugins live under `wp-content/plugins/` (gitignored, but on disk) and must be mapped into the tests instance via `.wp-env.json`; confirm the mapping with `npx wp-env run tests-cli wp plugin list` (a check, not a user question). If a `🟢` plugin somehow isn't present in the tests instance, that's a harness-wiring bug to fix here — only reclassify it `🟡 contract` (back to step 2/3) if it genuinely can't be made present reproducibly.
- Seeds one smoke test (`apps/wordpress/tests/Integration/HarnessSmokeTest.php`) asserting the real plugin actually loaded (e.g. `assertTrue( class_exists( 'WooCommerce' ) )`) so an empty/half-booted suite is caught immediately. Throwaway — deleted before the commit (step 9).
- **Guarantees build artefacts stay gitignored** — confirm `apps/wordpress/tests/.gitignore` covers `/vendor/`, `.phpunit.result.cache`, and any integration coverage output; add what's missing.
- **Verifies the harness boots green** (`npm run test:php:integration`) and reports back what it created/changed.

Do not proceed to step 5 until the sub-agent reports the integration harness boots and the smoke test confirms the real plugin loaded. Steps 2–3 (triage + confirm) are independent — run them before/alongside this so the gate happens first.

### 5. Build the integration tests (one sequential sub-agent per `🟢`/`🟡` surface)

Like backfill's generation step, delegate writing to **fresh-context sub-agents, one per surface, run strictly sequentially** (they share `bootstrap-integration.php` and `TRIAGE.md`; sequential keeps shared edits collision-free). Use a sub-agent that can **write files and run the harness** (the general `Agent` tool — not read-only `Explore`).

Per surface, in sequence, hand the sub-agent its triage row + this brief — **prefixed with the same environment preamble from step 4** (env already running, never `wp-env start`, run every command from the repo root). Each sub-agent:

1. **Reads `references/integration-tests.md` first** — the integration discipline (real fixtures via the plugin's own factories/installers, assert-your-code-not-the-library, isolation/teardown for tables the plugin writes) freshly in context.
2. **Reads the source** behind the surface for its *observable* output, and identifies the real dependency it must drive.
3. **Builds a real fixture** with the plugin's own API — a real `WC_Order` via WooCommerce's factories/`wc_create_order()`, a real `MeprUser`/subscription via MemberPress' API — **not** a hand-written fake (faking is what disqualified this surface from backfill). For a `🟡 contract` row, instead loads a **recorded representative shape** of the dependency's data (a captured array/JSON fixture, an HTTP response via `pre_http_request`).
4. **Writes behaviour-driven tests** — one behaviour per test, `Given/When/Then` names, Arrange-Act-Assert, `assertSame` (strict). Runs *your* code against the **real** interaction and pins your code's **observed** output. Tests through public surfaces only. A `🟢 build` test goes at `apps/wordpress/tests/Integration/<Prefix><PascalName>/<Subject>Test.php` (the local-only tree); a `🟡 contract` test needs no real plugin, so it goes in the **unit** tree at `apps/wordpress/tests/Unit/Generated/<Prefix><PascalName>/<Subject>Test.php` instead, where `test:php`/CI runs it. Same `<Prefix>`/`<PascalName>` convention as backfill (`Plugin`|`MuPlugin`|`Theme` + slug PascalCased), **namespaced per folder** (`namespace RefactOS\Tests\Integration\Generated\PluginMyShop;` for integration, `…\Unit\Generated\…` for contract), `class <Subject>Test extends \WP_UnitTestCase`, basename == class short name. Template: `assets/integration-test-template.php`.
5. **Isolates state the real plugin writes.** A real plugin writes to its own DB tables, which `WP_UnitTestCase`'s transactional rollback may not cover. Use the plugin's teardown or clean up in `tear_down()` so tests stay independent (INVEST) — see the reference's isolation section.
6. **Runs its own surface's tests green** via observe-then-assert: on a red, read the actual value and correct the expectation to **observed** behaviour (a good red); fix harness/loading errors itself (a bad red); does **not** silently pin a suspected defect — leaves it failing and reports it.
7. **Updates its own `TRIAGE.md` row** — flip `🟢 build` → `✅ integration-covered` (or `🟡` → `✅ contract-covered`), filling the Test-file column.

It then **returns a structured report**: tests written, rows finalized, fixtures/installers it needed, any suspected defects, green/red result.

**Orchestrator — between sub-agents:** surface any suspected defect to the user (never pin it); refresh the `TRIAGE.md` roll-up; then dispatch the next surface.

### 6. Run the integration suite and report against the triage ledger

Tell the user you're running the full integration suite, then:

```bash
npm run test:php:integration
```

Give a short summary reported **against `TRIAGE.md`** (not just the green count): N tests / N assertions across the M surfaces built, plus the roll-up — `✅ integration-covered` / `✅ contract-covered` / `⚪ skipped` / any still open. Distinguish a *good* red (your expected value didn't match real behaviour → adjust the test) from a *bad* red (harness/plugin-activation error — real plugin not loaded, tables not installed → fix without bothering the user). For a true failure that looks like a **genuine defect** in your code, flag it — never pin it.

### 7. Iterate until green AND every triage row is terminal

Done has two conditions:

1. the **integration suite is green**, and
2. **every `TRIAGE.md` row is terminal** — `✅ integration-covered`, `✅ contract-covered`, or `⚪ skipped` (with reason). No `🟢`/`🟡` row may remain unbuilt unless the user has explicitly signed off on deferring it (note the sign-off beside the row).

Then run the **unit** suite once (`npm run test:php`) to confirm the integration harness changes didn't disturb backfill's existing tests.

### 8. Cross-reference back into backfill's `COVERAGE.md`

Close the loop so backfill's ledger reflects what the integration suite picked up. For each `🔌` row now covered, annotate its `COVERAGE.md` row's Notes/Test-file column to point at the integration test — e.g. `🔌 integration → ✅ Integration/PluginMyShop/CartSummaryTest.php`. Leave the `🔌` symbol (it's still not a *unit* test, so backfill's own done-gate is unaffected) but make it visibly **covered elsewhere**, so a future backfill re-run doesn't read it as an open gap and a human reading the ledger sees the whole picture. Rows you triaged `⚪ skip → back to backfill as a stub` should be flagged to the user to re-run backfill on (don't silently rewrite backfill's disposition).

### 9. Offer to commit (once green and every triage row is terminal)

With both done-conditions met, **suggest** a single Conventional Commit — don't commit silently:

```
test(integration): add real-plugin integration tests for <surfaces covered>
```

Include the integration tests + `TRIAGE.md` (`apps/wordpress/tests/Integration/`), the `bootstrap-integration.php` + `phpunit-integration.xml.dist` + `package.json` script if added this session, the `COVERAGE.md` cross-reference annotations (step 8), and `composer.json`/`composer.lock` if changed — **never** `tests/vendor/`, coverage output, or the throwaway smoke test (delete it first, step 4). Delete `Integration/HarnessSmokeTest.php` before committing — the built suite now keeps PHPUnit non-empty. Local commit only; opening a PR stays out of scope.

## Conventions (quick reference)

- **Input = backfill's `🔌 integration` rows, not a fresh scan.** The candidate pool is `COVERAGE.md`'s `🔌` rows (each names its complex dep). If `COVERAGE.md` is absent, run `backfill-tests` first (or accept a single user-named surface).
- **The decision gate is the whole point.** `🔌` means "couldn't unit-test it," **not** "must integration-test it." Since the `🔌` flag already establishes "a faithful stub is impossible," each row needs just **one judgment** — does a silent break have real cost (money, data, access, a visible flow)? — plus **one lookup** you already ran: does the dep run locally? Real cost + runs locally → `🟢 build` (real integration test); real cost but can't run reproducibly → `🟡 contract` (recorded-shape test); no cost / cosmetic → `⚪ skip` (or back to backfill as a stub). The user **confirms the build list** before anything is written.
- **Detect availability with `wp-cli`, don't ask.** Check only the deps the `🔌` rows name — plugins via `wp plugin list`, a parent-theme dep via `wp theme list` (read once, look the named deps up) — never a per-surface "is X active?" question. Active → available, ask nothing. Installed-but-inactive → one batched prompt: *activate now (you run `wp plugin activate` in `cli` **and** `tests-cli`) or drop the surface*. Not installed → `🟡 contract`. A dep confirmed active here is trusted by step 4 and never re-asked.
- **You test YOUR code through the REAL dependency.** Activate the real plugin so the interaction is real; assert only your code's observable output, never the library's own correctness. A real fixture (real `WC_Order`, real `MeprUser`) via the plugin's own API — never a hand-written fake (faking is what disqualified the surface from backfill).
- **Separate, opt-in, local-only harness.** A second config `phpunit-integration.xml.dist` + `bootstrap-integration.php` that loads & installs the real plugins, run via `npm run test:php:integration`. It runs **locally, on demand — never in CI**; CI runs the fast unit suite (`test:php`), which is untouched and never needs the real plugins. A dep no maintainer has locally ⇒ that surface is `🟡 contract`, not `🟢 build`. Contract tests use no real plugin, so they live in the **unit** tree and *do* run in CI.
- **Isolation:** real plugins write their own tables; clean them up in `tear_down()` so tests stay independent (INVEST). See `references/integration-tests.md`.
- **Ledgers:** this skill owns `tests/Integration/TRIAGE.md` (the build decision); it cross-references covered rows back into backfill's `COVERAGE.md` (step 8) so neither ledger lies about coverage.
- **Style:** behaviour-driven (Given/When/Then), Arrange-Act-Assert, `assertSame`, one behaviour per test, INVEST at the test level — same discipline as `backfill-tests`, applied to real-dependency interactions.
- **Location:** `🟢` integration tests → `apps/wordpress/tests/Integration/<Prefix><PascalName>/` (local-only); `🟡` contract tests → `apps/wordpress/tests/Unit/Generated/<Prefix><PascalName>/` (CI-safe). File == class short name, namespaced per folder, `extends \WP_UnitTestCase`.
- **Characterization, not design:** the code already exists — pin observed behaviour, write no production code, surface (never pin) any bug a test exposes. Finish by offering a single local commit.
