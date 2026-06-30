# Characterization Tests — Writing Unit Tests for Existing Code

The discipline for the `backfill-tests` skill: how to put a behaviour-driven safety net under WordPress code that already exists. This is the **complement** of `red-green-refactor`. There, a failing test comes first and *drives* the design. Here the code is already written, so the test's job is different — to **capture and pin the current observable behaviour** so the code can be changed safely later. Michael Feathers' name for this is a *characterization test*: "a test that characterizes the actual behaviour of a piece of code… a way to document the actual current behaviour of the system."

## Table of contents

1. Characterization vs. red-green-refactor — what changes
2. What carries over from the TDD skills (and what doesn't)
3. The observe-then-assert technique
4. Choosing what to test (the observable surfaces)
5. What NOT to test
6. WordPress specifics — fixtures, surfaces, assertions
7. Loading the code under test
8. Naming, namespacing, and placement
9. A worked example
10. Good-red vs. bad-red, and the "is this a bug?" decision
11. Stubbing third-party dependencies without external libraries

---

## 1. Characterization vs. red-green-refactor — what changes

| | red-green-refactor (new code) | backfill-tests (existing code) |
|---|---|---|
| Order | test **before** code | code already exists; test **after** |
| The test's job | **drive** the design of code that doesn't exist | **document/pin** the behaviour of code that does |
| The red bar | proves the feature is genuinely absent | proves your *assumption* about current behaviour is wrong (or a harness error) |
| "Done" | the slice's acceptance criterion is met | every surface in the coverage ledger is terminal (`✅`/`🔌`/`⛔`/`⚪`, no open `🔲`) **and** the suite is green |
| Production code | you write it, minimum-to-green | you write **none** — the code is untouched |

The risk you are managing is also different. In TDD the risk is *building the wrong thing*; the failing acceptance criterion guards it. In characterization the risk is *misunderstanding what the code already does* — so every assertion must reflect behaviour you have **actually observed**, never behaviour you assume it *should* have.

## 2. What carries over from the TDD skills (and what doesn't)

The user wants these tests to share the characteristics the TDD harness enforces. They do — at the level of an individual test:

**Carries over:**
- **Behaviour-driven structure.** Name tests as `Given/When/Then`; structure bodies as **Arrange-Act-Assert**. Assert on *observable behaviour*, not implementation.
- **INVEST, at the test level.** Each test is **I**ndependent (no shared mutable state; `WP_UnitTestCase` resets the DB between tests), focused on one **V**aluable behaviour, **S**mall, and **T**estable. If a test needs the word "and" to describe what it checks, split it.
- **One behaviour per test**, small and fast. Many small tests beat a few big ones.
- **Strict assertions.** Prefer `assertSame` over `assertEquals` (no type juggling). Use the WP fixture factory for data.
- **Listen to the tests.** Code that's painful to characterize (hidden globals, no seams, side-effects everywhere) is telling you about a design smell. Note it for the user — it's a candidate for the TDD harness to refactor later — but don't fix it here.

**Does NOT carry over** (because the code already exists):
- **No red-first-to-drive-design.** You're not designing an interface; it exists. You still *run* each new test and confirm it passes against the real code (or fails for a reason you understand — §10), but the test doesn't precede the code.
- **No vertical slicing / walking skeleton / acceptance criteria.** Those decompose *new* feature work. Here you map *existing* surfaces.
- **No production code, no refactor-on-green, no PR.** You add tests only.

## 3. The observe-then-assert technique

Feathers' method for pinning unknown behaviour, adapted:

1. **Read the code** and form a hypothesis about what an observable surface returns/does for a given input.
2. **Write the test** asserting your hypothesised value.
3. **Run it.**
   - **Passes** → your understanding was right; the behaviour is now pinned. Move on.
   - **Fails** → read the *actual* value from the failure message. Now decide (§10): if the actual is reasonable behaviour, **correct the assertion to the observed value** — that's the whole point, you're documenting reality. If the actual looks wrong, you may have found a **bug**: surface it to the user rather than pinning it.

This is why a characterization test failing is normal and useful, not alarming — it's the moment your assumption meets reality. Keep the steps tiny so each failure points at one thing.

## 4. Choosing what to test (the observable surfaces)

Prioritise surfaces that carry **real logic** and are **observable from outside** the unit. In a WordPress plugin/theme those are typically:

- **Shortcodes** — assert on `do_shortcode('[thing attr="x"]')` output.
- **Filters** — assert on `apply_filters('hook', $input, …)` return for representative inputs.
- **Actions / side effects** — fire `do_action('hook')` and assert the observable result (a saved option, post meta, an enqueued item, a sent-mail capture).
- **Public functions** — assert return values across the meaningful input classes (happy path, empty, boundary).
- **Class public methods** — instantiate (or resolve) and assert behaviour through the public API.
- **REST routes** — dispatch with `rest_do_request( new WP_REST_Request(...) )` and assert status + payload.
- **Block render callbacks** — call the registered `render_callback` with sample attributes and assert the markup.

Order within a folder: start with the surface that has the **most logic / highest change-risk**, get it covered, then the next.

**Separate two kinds of "exhaustive" — the distinction the coverage ledger enforces:**

- **At the *branch* level you need not be exhaustive.** You don't have to pin every `if`/`else` permutation of a surface on the first pass — characterize the load-bearing paths and move on. Branch depth is a judgement call.
- **At the *surface* level you must be exhaustive.** Every observable surface gets *inventoried and dispositioned* — there is no "skip the small ones." A surface either earns a test (`🔲`→`✅`, stubbing any *simple* third-party dep it calls — §11), or is `🔌 integration` with a named *complex* dep, or is `⛔ blocked` with a named seam, or is `⚪ excluded` as trivial glue. "I judged it low-value and didn't write it" is not a disposition; that is the silent gap the ledger exists to close. The skill's step 4 builds this inventory (one `🔲`/`🔌`/`⛔`/`⚪` row per surface) *before* any test is written, so completeness is checkable rather than a matter of how far you happened to get.

## 5. What NOT to test

- **Private/protected methods and internal state.** Test through the public surface; if a private method's behaviour matters, it shows up there.
- **Implementation details** (which helper was called, internal call order). That couples the test to structure and makes the safety net brittle — the opposite of what a regression suite is for.
- **Trivial glue** — pure getters/setters, `register_*` calls with no logic, config arrays. Low value, noise.
- **Framework / library behaviour itself** — you're testing *your* code, not WordPress core and not the third-party plugin. When your code *calls* a third-party dependency, **stub the dependency** (§11) and assert what *your* code does with the result — never assert the library's own correctness.
- **Uncontrollable external effects** — these are **seams**, and they split two ways. Some you *can* control without touching the source, so the surface stays testable: HTTP via the `pre_http_request` filter, a third-party value-returning function via a hand-written fake (§11). Others have **no seam as written** — raw `time()`, `rand()`, direct sockets, hard `define()`/global state — and this skill may not edit the source to add one; note them for the user and mark the surface `⛔ blocked`. Never write a test that hits the real network or the real wall clock.

## 6. WordPress specifics — fixtures, surfaces, assertions

- **Base class:** every generated test `extends \WP_UnitTestCase` (note the leading `\` — the test class is namespaced; `WP_UnitTestCase` is global). It boots WordPress and resets the DB between tests.
- **Fixtures:** `self::factory()->post->create([...])`, `->user->create()`, `->term->create()`, etc. Don't hand-insert rows.
- **Assertions:** `assertSame` for scalars/arrays; `assertStringContainsString` for rendered markup where exact HTML is brittle; WP helpers (`assertWPError`, `assertSameSets`) where they fit.
- **Run the pinned binary** (`./vendor/bin/phpunit` via `--env-cwd=tests`), never the container's global PHPUnit 10 — see `test-strategy.md` §2.
- **Method naming** stays WP-style (`public function test_...()`), but make the name a sentence of behaviour: `test_renders_zero_total_for_empty_cart()`, `test_strips_disallowed_tags_from_excerpt()`.

## 7. Loading the code under test

The test can only call the code if it's loaded. Two routes:

1. **Bootstrap loader (preferred for whole plugins/mu-plugins).** `tests/bootstrap.php` already requires plugin main files inside a `tests_add_filter('muplugins_loaded', …)` callback. Add each scanned plugin's entry file to that same callback, guarded:

   ```php
   foreach ([
     'my-shop/my-shop.php',
     'core-logic/core-logic.php',
   ] as $rel) {
     $main = dirname(__DIR__) . '/wp-content/plugins/' . $rel; // mu-plugins/ for MU
     if (file_exists($main)) require $main;
   }
   ```

   This loads the plugin the way WordPress does, which is the most faithful basis for characterization. (Don't create a second bootstrap — extend the existing loader.)

2. **Test-local `require_once` (good for isolated functions / theme files).** At the top of the test file:

   ```php
   require_once dirname(__DIR__, 2) . '/wp-content/themes/acme/inc/excerpt.php';
   ```

   Use this for **themes** — there's no plugin-style auto-load. Require the specific files under test. If the code depends on theme-setup hooks (`after_setup_theme`), fire them in `setUp()`:

   ```php
   public function set_up(): void {            // public, not protected — WP_UnitTestCase declares set_up() public; narrowing it fatals
     parent::set_up();
     do_action('after_setup_theme');
   }
   ```

Guard every `require` with `file_exists` so a renamed file fails as a clear test error, not a fatal that takes the whole suite down.

## 8. Naming, namespacing, and placement

- **Folder:** `tests/Unit/Generated/<Prefix><PascalName>/` — `<Prefix>` ∈ `Plugin|MuPlugin|Theme`, `<PascalName>` = slug split on non-alphanumerics, each token capitalised, joined (`my-shop` → `MyShop`).
- **File:** one per subject under test, **basename == class short name**, suffix `Test.php` (`CartTest.php`).
- **Namespace per folder** to prevent class-name collisions between two `CartTest.php` in different folders (PHP has no overloading; two global `class CartTest` would fatal):

  ```php
  namespace RefactOS\Tests\Unit\Generated\PluginMyShop;
  class CartTest extends \WP_UnitTestCase { … }
  ```

  PHPUnit derives the expected class from the **filename** (the short name), so `CartTest.php` → short name `CartTest` still matches even when namespaced. The existing `./Unit` testsuite recurses into `Generated/`, so **no `phpunit.xml.dist` edit is needed**.

- **Shared helpers (traits / base classes) must be loaded explicitly.** A non-test file — `_stubs.php`, a `Loads<Theme>Trait.php`, a shared base `TestCase` — is **not** collected *or* autoloaded by PHPUnit, which globs only `*Test.php`. `require_once` it from `bootstrap.php` (alongside the `_stubs.php` load) so it exists before any test references it; otherwise the first run fatals with "trait/class not found". Keep the `*Test.php` suffix **off** these files so the runner doesn't try to collect them as tests.

## 9. A worked example

Source (`wp-content/plugins/my-shop/includes/cart.php`) — a shortcode that renders a cart total:

```php
add_shortcode('order_total', function () {
  $items = my_shop_get_cart_items();           // [] when empty
  $total = array_sum(wp_list_pluck($items, 'price'));
  return '£' . number_format($total, 2);
});
```

Characterization test (`tests/Unit/Generated/PluginMyShop/OrderTotalShortcodeTest.php`):

```php
<?php
namespace RefactOS\Tests\Unit\Generated\PluginMyShop;

class OrderTotalShortcodeTest extends \WP_UnitTestCase {

  /** Given an empty cart, When [order_total] renders, Then it shows £0.00 */
  public function test_renders_zero_total_for_empty_cart() {
    // Arrange: default state is an empty cart.
    // Act:
    $out = do_shortcode('[order_total]');
    // Assert: pin the observed behaviour.
    $this->assertSame('£0.00', $out);
  }

  /** Given two items, When [order_total] renders, Then it shows their summed, formatted total */
  public function test_sums_and_formats_line_item_prices() {
    // Arrange:
    add_filter('my_shop_cart_items', fn() => [['price' => 9.5], ['price' => 0.5]]);
    // Act:
    $out = do_shortcode('[order_total]');
    // Assert:
    $this->assertSame('£10.00', $out);
  }
}
```

Both tests name a `Given/When/Then`, follow Arrange-Act-Assert, assert on the rendered surface (not internals), and pin values you confirmed by running them. If the second had failed showing `£10` (no decimals), you'd correct the expectation to the observed `£10` — *unless* the format string clearly intends two decimals, in which case you'd flag a possible bug to the user.

## 10. Good-red vs. bad-red, and the "is this a bug?" decision

After running a new test, read the result deliberately:

- **Green** → behaviour pinned. Done with that test.
- **Good red** — your expected value didn't match the real value (`Failed asserting that '£10' is identical to '£10.00'`). This is the normal characterization signal: **correct the assertion to the observed value** and re-run. You are documenting reality.
- **Bad red** — a harness/loading error, not a behaviour mismatch: PHP fatal, "class … cannot be found" (filename ≠ class short name), "service tests-cli is not running", "undefined method parseTestMethodAnnotations" (ran global PHPUnit 10), missing `require` for the code under test. Match the symptom in `test-strategy.md` §4 and fix the harness — don't change the assertion, and don't bother the user with these.
- **Suspected bug** — the actual behaviour is observable and reproducible but looks **wrong** (off-by-one, wrong rounding, an error swallowed). Do **not** silently pin it — a characterization suite that encodes a bug makes the bug permanent. Surface it to the user with the input, the actual, and what you'd have expected, and let them decide: pin-as-is (document the quirk, often with a comment), or leave it failing as a found defect for the TDD harness to fix.

"If you cannot articulate why a test fails, you do not yet understand the behaviour." Shrink the case until you can.

## 11. Stubbing third-party dependencies without external libraries

Much of the maintained code you characterize calls into a third-party plugin or library — WooCommerce, MemberPress, ACF, an HTTP API. The naive reading of §5 ("don't test framework/library behaviour") is "skip the surface." That throws away coverage of *your* logic. The right move is to **stub the dependency and test your own code around it** — by hand, with no external mocking library.

### The decision rule

Classify the *dependency*, not the surface:

- **Simple** — a function that returns a value (`wc_get_product()`, ACF `get_field()`), a single simple class method, or an HTTP call. **Stub it** with a hand-written fake. Fast, focused, and it keeps the test about your logic. The surface is `🔲 deferred` until written, then `✅ covered`.
- **Complex** — a deep object graph or several interconnected classes (a full `WC_Cart` with line items, coupons, taxes, sessions; a `MeprUser` and its related transaction/subscription objects). **Do not fake it.** Mark the surface `🔌 integration` and name the dep; it belongs in an integration test against the real plugin (a suite this skill does not build).
- **No seam** — a non-deterministic or external effect with no interception point and no source change allowed here (raw `time()`, `rand()`, a direct socket): `⛔ blocked`, seam named.

**The rule of thumb:** if stubbing would make you reimplement a significant chunk of someone else's library, you've gone too far — that's the signal to stop and reach for an integration test (`🔌`), not a bigger fake. A fake should be a few lines that return a canned value, not a re-creation of the library.

A note on what you're pinning: everywhere else in characterization you assert behaviour you **observed** from the real code. With a stubbed boundary you instead **choose** the dependency's return value, so pick *representative* inputs (happy path, empty, a boundary) and let the test name say which case it pins. You are still characterizing — the subject is your code's handling of that value, which you do observe.

### Why hand-written fakes work here

The harness loads only **maintained** code (the `muplugins_loaded` loader in `bootstrap.php`); third-party plugins are gitignored and never loaded. So the third-party function and class **names are free** — you can declare your own. Guard every fake with `function_exists()` / `class_exists()` so that if some maintained code transitively pulls in the real definition, you don't fatally redeclare (PHP cannot redefine an existing function or class).

### Where fakes live, and the per-test-variation problem

Put all fakes in one shared file, `apps/wordpress/tests/Unit/Generated/_stubs.php`, and `require` it from `bootstrap.php` **before** any maintained entry file (so a fake exists if a plugin checks `function_exists()` at load time). The `_stubs.php` name never matches the `*Test.php` glob, so PHPUnit won't collect it; it's committed with the suite.

Because a function is defined **once for the whole suite** and can't be redefined per test, a fake that needs to return different things in different tests must be **configurable** — route its return through a filter (or a test-settable global) that each test arranges:

```php
// tests/Unit/Generated/_stubs.php  — loaded by bootstrap.php before maintained code
if (!function_exists('wc_get_product')) {
    /** Hand-written fake. Tests set the return via the 'stub_wc_get_product' filter. */
    function wc_get_product($id) {
        return apply_filters('stub_wc_get_product', null, $id);
    }
}

if (!class_exists('Fake_WC_Product')) {
    /** Tiny stand-in — only the methods your code actually calls. */
    class Fake_WC_Product {
        public function __construct(private float $price) {}
        public function get_price() { return $this->price; }
    }
}
```

`WP_UnitTestCase` resets filters between tests, so the per-test `add_filter` is automatically torn down — no shared mutable state, INVEST intact.

### Three techniques

1. **Fake function (configurable).** As above — declare the missing function in `_stubs.php`, have it return `apply_filters('stub_<fn>', $default, …)`, and set the value per test:

   ```php
   public function test_badge_formats_price_with_currency() {
     // Arrange — a product priced 9.5 (representative happy path).
     add_filter('stub_wc_get_product', fn() => new Fake_WC_Product(9.5));
     // Act — our code under test.
     $out = my_plugin_price_badge(123);
     // Assert — OUR formatting, not WooCommerce's math.
     $this->assertSame('Only £9.50!', $out);
   }
   ```

2. **Fake class / object.** Hand-write a minimal class exposing only the methods your code calls (`Fake_WC_Product` above). Keep it dumb — canned returns, no logic. If a third-party **interface or class is genuinely available** in the harness, PHPUnit's built-in `$this->createStub(Some_Interface::class)` is fair game — it ships with PHPUnit, so it is **not** an "external library." But for the common WP case (the real class isn't loaded) you hand-write the stand-in.

3. **HTTP via `pre_http_request`.** Never hit the network. Short-circuit WordPress's HTTP API by returning a canned response (any non-`false` value bypasses the real request), then assert what your code does with the body:

   ```php
   public function test_handles_api_success_payload() {
     add_filter('pre_http_request', fn() => [
       'response' => ['code' => 200],
       'body'     => '{"status":"active"}',
     ], 10, 3);
     $this->assertTrue(my_plugin_membership_is_active(42));
   }
   ```

### Mapping to dispositions

| Dependency the surface calls | Disposition | Ledger note |
|---|---|---|
| value-returning fn / simple method / HTTP | `🔲`→`✅` (write a stub) | `(stubbed: wc_get_product)` |
| deep object graph / interconnected classes | `🔌 integration` | name the dep |
| effect with no seam, no source change allowed | `⛔ blocked` | name the seam |

A worked counter-example: a `[cart_summary]` shortcode that walks `WC()->cart->get_cart()` line items, applies coupons, and reads tax totals is **not** a simple stub — faking that faithfully reimplements WooCommerce's cart. Mark it `🔌 integration` and move on. A `[member_badge]` shortcode whose only dependency is `mepr_user_active($id)` returning a bool **is** simple — fake the one function, pin both the active and inactive branches, `✅ covered`.
