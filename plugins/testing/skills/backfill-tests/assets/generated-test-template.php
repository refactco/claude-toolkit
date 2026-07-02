<?php
/**
 * TEMPLATE for a generated characterization test.
 *
 * Copy this into:
 *   apps/wordpress/tests/Unit/Generated/<Prefix><PascalName>/<Subject>Test.php
 *     <Prefix>      = Plugin | MuPlugin | Theme
 *     <PascalName>  = source slug split on non-alphanumerics, each token capitalised
 *                     (my-shop -> MyShop, wp-2fa -> Wp2fa, core-logic -> CoreLogic)
 *     <Subject>     = the surface under test (OrderTotalShortcode, ExcerptFilter, ...)
 *
 * Rules (see references/characterization-tests.md):
 *   - File basename MUST equal the class short name  (CartTest.php -> class CartTest).
 *   - Namespace per folder so two CartTest.php in different folders don't collide.
 *   - extends \WP_UnitTestCase  (leading backslash — WP_UnitTestCase is global).
 *   - One behaviour per test. Given/When/Then names. Arrange-Act-Assert bodies.
 *   - assertSame (strict). Pin OBSERVED behaviour, not assumed behaviour.
 *   - Simple third-party deps the surface calls -> stub them in Generated/_stubs.php
 *     (guarded, configurable via a filter). Complex object graphs -> don't fake;
 *     mark the surface 🔌 integration. See references/characterization-tests.md §11.
 *   - No phpunit.xml change — the ./Unit testsuite already recurses into Generated/.
 *
 * Delete this header and the placeholder tests in the real file.
 */

namespace RefactOS\Tests\Unit\Generated\PluginExample; // <-- match the folder

// Theme code (and isolated functions) may need a direct require — see the reference.
// require_once dirname(__DIR__, 2) . '/wp-content/themes/<slug>/inc/<file>.php';

class ExampleSubjectTest extends \WP_UnitTestCase {

    // If the code under test relies on theme-setup hooks, fire them here:
    // public function set_up(): void {   // public, not protected — WP_UnitTestCase declares it public
    //     parent::set_up();
    //     do_action('after_setup_theme');
    // }

    /**
     * Given <starting state>
     * When  <the observable trigger>
     * Then  <the externally observable outcome>
     */
    public function test_describes_the_behaviour_in_a_sentence() {
        // Arrange — set up fixtures with the WP factory, not raw inserts.
        // $post_id = self::factory()->post->create(['post_title' => 'Demo']);
        // If the surface calls a simple third-party dep, stub it here (see _stubs.php):
        // add_filter('stub_wc_get_product', fn() => new Fake_WC_Product(9.5));

        // Act — exercise the observable surface (shortcode, filter, function, route).
        // $output = do_shortcode('[example]');

        // Assert — pin the value you OBSERVED the code produce.
        // $this->assertSame('expected observed value', $output);

        $this->markTestIncomplete('Replace with a real characterized behaviour.');
    }
}
