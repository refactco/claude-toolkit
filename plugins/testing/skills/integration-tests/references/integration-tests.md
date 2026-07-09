# Integration Tests Against Real WordPress Plugins — Reference

The companion to `references/characterization-tests.md` in `backfill-tests`. That file
covers **unit** characterization (maintained code only, third-party deps *stubbed*).
This file covers the opposite boundary: pinning maintained code that depends on a
**complex** third-party object graph by running it against the **real** plugin.

Read this in full before writing any integration test (the SKILL's step 5 sub-agents do).

## Contents

1. When integration is the right tool (and when it isn't)
2. Unit harness vs. integration harness — the one decisive difference
3. The separate PHPUnit config and bootstrap
4. Loading and *installing* the real plugins
5. Building real fixtures with the plugin's own API
6. Asserting YOUR code, never the library
7. Isolation — cleaning up tables the real plugin writes
8. The contract-test fallback (`🟡`) — when the real plugin can't run reproducibly
9. Good red vs. bad red, integration edition

---

## 1. When integration is the right tool (and when it isn't)

The decision gate lives in the SKILL (step 2). The one-line version: an integration test
earns its keep only when **a faithful stub is impossible** (correctness lives in the real
interaction) **and** **a silent break has real cost** (money, data, access, a visible
flow). A `🔌 integration` flag from backfill clears the first; you still owe the second.

What integration testing is **not** for:
- A dep read for one or two values → that's a *stub* and a unit test (back to backfill).
- Asserting the library's own behaviour → never. You assert *your* code's output.
- A surface with no seam (`⛔ blocked`) → needs a source change first (TDD territory).
- Compensating for thin unit coverage → integration tests are slower and flakier; they
  are a scalpel for the real-interaction surfaces, not a substitute for unit breadth.

## 2. Unit harness vs. integration harness — the one decisive difference

backfill's harness **gitignores third-party plugins and never loads them**. The whole
hand-written-stub technique exists *because* the real classes aren't present, so their
names are free to declare. That is exactly why a complex object graph can't be faked —
you'd be re-creating the library.

The integration harness inverts this for the deps under test: it **loads and activates
the real plugin**, so `WooCommerce`, `WC_Cart`, `MeprUser` etc. are the genuine classes.
Keep this in a **separate** config and bootstrap so the fast unit suite never pays for it
and never depends on the real plugins being present.

**This integration suite runs locally, on demand — never in CI.** The real plugins are
typically premium/license-gated and slow to install; shipping them into CI is the wrong
trade. CI runs only the unit suite (`test:php`), which needs no real plugin. The CI-safe
output of this skill is the `🟡 contract` tests (§8): they use a recorded fixture, no real
plugin, so they live in the *unit* tree and run in CI like any other unit test.

## 3. The separate PHPUnit config and bootstrap

Do **not** add the integration suite to backfill's `phpunit.xml.dist`. Create a sibling:

`<wp-app>/tests/phpunit-integration.xml.dist`
- PHPUnit 9, `bootstrap="bootstrap-integration.php"`.
- One testsuite, directory `Integration/`, suffix `Test.php`.
- No `<coverage>` block needed by default — integration coverage mixes your lines with
  the real plugin's; if you do measure, scope `<include>` to maintained source only,
  exactly as backfill does.

Run it explicitly, never as part of the everyday runner:

```jsonc
// package.json
"test:php":             "wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit",                              // backfill — fast, no real plugins
"test:php:integration": "wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit -c phpunit-integration.xml.dist" // this skill — opt-in
```

Run these from the **repo root** (where `.wp-env.json` lives), with the wp-env environment
**already started** — never `wp-env start` again mid-run. A second start collides on port
8888 and spawns a stray project hash you then have to `docker rm` by hand. `--env-cwd=tests`
resolves the tests dir relative to the root, so a wrong **cwd** (running from `<wp-app>`),
not a wrong command, is the usual cause of an `environment not initialized` error.

## 4. Loading and *installing* the real plugins

**First, detect — don't ask.** Whether a named dep is available is a fact you read with
`wp-cli`, never a question to the user (asking per surface is the friction this skill exists
to remove). Check **only the deps the `🔌` rows name** — a plugin via `wp plugin list`, a
parent-theme dep via `wp theme list`:

```bash
npx wp-env run cli wp plugin list --fields=name,status,version    # dev instance
npx wp-env run cli wp theme list  --fields=name,status,version    # only if a 🔌 dep is a theme
```

Map the named dep to a slug — usually a plugin (`MeprUser`→`memberpress`, `WC_*`→`woocommerce`,
Gravity Forms→`gravityforms`, ACF→`advanced-custom-fields[-pro]`), occasionally a parent
**theme** — and branch on its status:

- **active** → available; proceed silently.
- **inactive** → activate it yourself once the user okays it (single batched prompt):
  `npx wp-env run cli wp plugin activate <slug>` **and**
  `npx wp-env run tests-cli wp plugin activate <slug>` (theme deps: `wp theme activate`).
- **not listed** → not installed → the surface is `🟡 contract` (§8), not a real test.

The integration bootstrap (`require` of the plugin file) is what actually loads the plugin
for the suite, but keeping the site **active** in both instances avoids surprises and lets
plugins that gate behaviour on their own active-state behave normally.

The third-party plugins are on disk under `<wp-app>/wp-content/plugins/` (gitignored,
but present in the dev/test environment). Confirm they're mapped into the **tests**
instance in `.wp-env.json` (the same mapping that exposes them to the dev instance).

**Match `$_tests_dir` to the project — don't copy the literal below.** The default
test-suite path differs by wp-env setup (`/tmp/wordpress-tests-lib`, `/wordpress-phpunit`, …).
**Read the project's existing unit `tests/bootstrap.php` and reuse the exact same `$_tests_dir`
default it uses.** A wrong default boots an empty harness that dies with a missing
`includes/functions.php` / `includes/bootstrap.php` — a confusing failure that looks like a
test problem but is really a path problem.

`<wp-app>/tests/bootstrap-integration.php`:

```php
<?php
$_tests_dir = getenv('WP_TESTS_DIR') ?: '/tmp/wordpress-tests-lib';  // <-- MATCH the project's unit bootstrap.php; this default varies per setup
require_once 'vendor/yoast/phpunit-polyfills/phpunitpolyfills-autoload.php';
require_once $_tests_dir . '/includes/functions.php';   // tests_add_filter() available

tests_add_filter('muplugins_loaded', function () {
    $plugins = WP_PLUGIN_DIR;

    // (a) the REAL third-party plugin(s) under test — the ones backfill omits
    require $plugins . '/woocommerce/woocommerce.php';
    // require $plugins . '/memberpress/memberpress.php';

    // (b) the maintained plugins whose surfaces you're characterizing
    require $plugins . '/refact-rate-limit-monitor/refact-rate-limit-monitor.php';
});

// Many plugins need their installer to run so their DB tables exist in the test DB.
tests_add_filter('setup_theme', function () {
    if (class_exists('WC_Install'))  { WC_Install::install();  }   // WooCommerce
    // MemberPress: MeprDbMigrations / activation routine — see plugin docs.
});

require $_tests_dir . '/includes/bootstrap.php';
```

**Discover the real installer by reading the plugin's own source — do not trust these notes,
the plugin's docs, or a hint in your brief blindly.** Activation hooks and upgrade routines
drift between versions, and a plugin's *registered activation hook is often not what creates
its tables*. After boot, **prove the tables exist** before relying on them
(`npx wp-env run tests-cli wp db query "SHOW TABLES LIKE 'wp_<prefix>_%'"`). The notes below
are starting points, not gospel:

- **WooCommerce** — `WC_Install::install()` creates the `wc_*`/`woocommerce_*` tables and
  default options. `wc_create_order()`, `WC_Cart`, product CRUD then work. Define
  `WP_UNINSTALL_PLUGIN` guards as needed; some versions want `update_option('woocommerce_db_version', WC()->version)`.
- **MemberPress** — its registered activation hook (`mepr_on_activate()`) sets options/pages
  but may **not** create tables; the schema is built by the DB-migration routine
  (`MeprDb::fetch()->upgrade()` in recent versions, which runs the `dbDelta` calls). Trigger
  *that*, not just the activation hook, then use `MeprUser`/`MeprSubscription`/`MeprTransaction`
  for fixtures. (This is the canonical example of "the activation hook isn't the installer.")
- **Gravity Forms** — install/upgrade via `gf_upgrade()->maybe_upgrade()`. Do **not** call
  `gf_upgrade()->upgrade(null, true)` — the forced path runs legacy migrations that spew
  `Table 'wp_rg_*' doesn't exist` DB errors into every downstream test's output (tests still
  pass, but the noise buries real reds). `GFAPI::add_form()` / `GFAPI::get_form()` then yield
  genuine `GF_Field` objects for fixtures.
- **ACF** — usually loads without an installer; field groups defined in PHP are available
  once the plugin file is required.

**Theme surfaces (the dep — or the maintained code — is a theme, not a plugin).** backfill
flags theme code too, so the maintained code under test is often a *theme*'s `functions.php`
/ `inc/*.php`, and a `🔌` dep can be a **parent theme** a child theme extends. Two
adjustments to everything above:

- **Detect/activate themes with `wp theme`, not `wp plugin`** — a parent-theme dep is found
  via `wp theme list` and activated with `wp theme activate <slug>` in **both** instances.
- **Make the theme's code load in the harness the same way the project's unit `bootstrap.php`
  already does** — typically by forcing the active theme through the `stylesheet`/`template`
  filters on `setup_theme` (mirror that mechanism; don't reinvent it). For a single
  standalone function whose file has no side effects, the test can simply
  `require_once get_theme_root() . '/<theme>/inc/<file>.php';` instead.
- **`<Prefix>` is `Theme`** → folder `Integration/Theme<PascalName>/`, namespace
  `RefactOS\Tests\Integration\Generated\Theme<PascalName>` (`🟡` contract: `…\Unit\Generated\…`)
  — the same Prefix/PascalName convention backfill uses (`PluginMyShop` → `ThemeInsivia`).

If a `🟢 build` plugin **can't be present reproducibly across maintainers** (premium,
license-gated, only one person has it locally), stop — that surface is `🟡 contract` (§8),
not a real integration test. The suite never runs in CI, so the bar is "any maintainer can
run it on their machine," not CI licensing — but a test that only passes on one laptop is
still worse than an honest contract test.

## 5. Building real fixtures with the plugin's own API

The defining move: build the dependency with the **real** API, not a fake.

```php
// Real WooCommerce order — the genuine object graph your code walks.
$product = WC_Helper_Product::create_simple_product();   // WC ships test helpers
$order   = wc_create_order();
$order->add_product($product, 2);
$order->calculate_totals();      // REAL tax/coupon/total math — the thing a stub couldn't fake
$order->save();

// Now exercise YOUR code against it.
$summary = my_shop_order_summary($order->get_id());
$this->assertSame('2 items — £19.00', $summary);   // assert YOUR formatting
```

```php
// Real MemberPress user with an active subscription.
$user = (new MeprUser())->create_test_user(...);   // via the plugin's API/helpers
// ...arrange a real active subscription...
$this->assertTrue(my_plugin_can_access($user->ID, 'premium'));  // YOUR gate, real graph
```

Prefer the plugin's **own test helpers/factories** where they ship (WooCommerce's
`WC_Helper_*`); fall back to its public API (`wc_create_order()`, `MeprUser`). Use WP's
`self::factory()` for the WordPress-side fixtures (users, posts) as usual.

## 6. Asserting YOUR code, never the library

The subject under test is always **your** code's observable output — a shortcode's HTML, a
filter's return, an access decision, an option/meta your code wrote. You let the *real*
plugin compute its part (that's the point), but you never assert "WooCommerce summed the
cart correctly." If a test would assert the library's own behaviour, it's the wrong test.

This keeps the suite from breaking on irrelevant library changes: you pin *the contract
your code relies on*, observed through the real interaction.

## 7. Isolation — cleaning up tables the real plugin writes

`WP_UnitTestCase` wraps each test in a DB transaction and rolls back core/WP tables. A real
plugin's **custom tables** (`wc_orders`, MemberPress' tables) may live outside that rollback
depending on the plugin and WP version. Keep tests independent:

- Prefer the plugin's own teardown if it offers one.
- Otherwise truncate/delete what you created in `tear_down()`:

```php
public function tear_down(): void {
    // remove orders/subscriptions this test created so the next test starts clean
    parent::tear_down();
}
```

A test that passes alone but fails in the suite (or vice-versa) is almost always leaked
plugin-table state — fix isolation, don't reorder tests to hide it.

## 8. The contract-test fallback (`🟡`) — when the real plugin can't run reproducibly

When the dep can't run reproducibly (no maintainer has the plugin locally, an external
gateway, a SaaS with no sandbox) but a silent break still has real cost, pin a **contract
test** instead of nothing:

- Capture a **representative shape** of the dependency's data — a real `WC_Order`'s array
  form, a recorded API JSON payload — as a fixture committed with the test.
- Drive your code with that fixture (an HTTP payload via `pre_http_request`, an array your
  code consumes), and assert your handling.

Because it needs **no real plugin**, a contract test is **CI-safe** — put it in the unit
tree (`tests/Unit/Generated/...`) so `test:php` and CI run it, *not* in the local-only
`Integration/` tree. What it buys and what it doesn't: it **catches regressions in *your*
parsing/handling** and is reproducible everywhere; it **cannot** catch the library changing
the shape under you (only the real plugin can, and that check is now local/manual). So note
the residual risk and what covers it (a staging smoke check, a manual pass on upgrade). It
is strictly better than leaving the surface untested, and honest about its limits.

## 9. Good red vs. bad red, integration edition

- **Good red** — your expected value didn't match what your code actually produces against
  the real interaction. Read the actual value, correct the expectation (characterization).
- **Bad red** — the harness, not your assertion: the real plugin **didn't load** (missing
  `require` in `bootstrap-integration.php`, plugin not mapped into the tests env), its
  **tables don't exist** (installer not run — §4), or a class-name ≠ filename issue. A
  fatal mentioning a real plugin class/table is almost always this. Fix it yourself; don't
  bother the user.
- **Suspected defect** — your code genuinely mishandles the real data. Do **not** pin it.
  Leave it failing and surface it; pinning a bug bakes it into the regression suite.
