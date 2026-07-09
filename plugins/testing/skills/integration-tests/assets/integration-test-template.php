<?php
/**
 * TEMPLATE for a generated integration test (runs YOUR code against the REAL plugin).
 *
 * Copy this into:
 *   <wp-app>/tests/Integration/<Prefix><PascalName>/<Subject>Test.php
 *     <Prefix>      = Plugin | MuPlugin | Theme
 *     <PascalName>  = source slug split on non-alphanumerics, each token capitalised
 *                     (my-shop -> MyShop, wp-2fa -> Wp2fa, core-logic -> CoreLogic)
 *     <Subject>     = the surface under test (CartSummaryShortcode, MeprGateFilter, ...)
 *
 * How this differs from a backfill UNIT test (see references/integration-tests.md):
 *   - The REAL third-party plugin is loaded & installed by bootstrap-integration.php.
 *     Do NOT hand-write a fake of WC_Cart / MeprUser — building the dep with its REAL
 *     API is the whole point (faking is what disqualified this surface from backfill).
 *   - You still assert only YOUR code's observable output, never the library's own math.
 *   - Clean up any custom tables the real plugin wrote, in tear_down() (isolation §7).
 *
 * Rules (shared with backfill):
 *   - File basename MUST equal the class short name  (CartSummaryTest.php -> class CartSummaryTest).
 *   - Namespace per folder so two same-named tests in different folders don't collide.
 *   - extends \WP_UnitTestCase  (leading backslash — WP_UnitTestCase is global).
 *   - One behaviour per test. Given/When/Then names. Arrange-Act-Assert bodies.
 *   - assertSame (strict). Pin OBSERVED behaviour, not assumed behaviour.
 *   - Run via:  npm run test:php:integration   (separate, opt-in config; run from the
 *     REPO ROOT — the wp-env environment is already up, do NOT `wp-env start`).
 *
 * Delete this header and the placeholder test in the real file.
 */

namespace RefactOS\Tests\Integration\Generated\PluginExample; // <-- match the folder

class ExampleSubjectTest extends \WP_UnitTestCase {

    /**
     * Given <a REAL dependency object built with the plugin's own API>
     * When  <your observable surface runs against it>
     * Then  <your code's externally observable outcome>
     */
    public function test_describes_the_behaviour_in_a_sentence() {
        // Arrange — build the REAL dependency with the plugin's API, not a fake.
        //   $product = \WC_Helper_Product::create_simple_product();
        //   $order   = wc_create_order();
        //   $order->add_product($product, 2);
        //   $order->calculate_totals();   // REAL totals — what a stub couldn't fake
        //   $order->save();

        // Act — exercise YOUR observable surface against the real object.
        //   $summary = my_shop_order_summary($order->get_id());

        // Assert — pin what YOUR code produced (not the library's own math).
        //   $this->assertSame('2 items — £19.00', $summary);

        $this->markTestIncomplete('Replace with a real characterized behaviour against the live plugin.');
    }

    /**
     * Real plugins write their own tables, which WP_UnitTestCase's rollback may not
     * cover. Clean up what this test created so the suite stays independent (INVEST).
     */
    public function tear_down(): void {
        // e.g. delete orders/subscriptions created above
        parent::tear_down();
    }
}
