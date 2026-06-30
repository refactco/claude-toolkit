import { test, expect, Page } from "@playwright/test";
import { routes, masks, env } from "./qaConfig";

// SOFT QA layer: one full-page screenshot per baseline route, compared against
// committed baselines, with dynamic regions (ads, sliders, latest-posts,
// announcement bar) masked. Per the decision rule, a visual diff only FLAGS for
// a human — it never auto-rolls-back or auto-promotes.
//
// Capture/refresh baselines:  npx playwright test tests/e2e/visual.spec.ts --update-snapshots
// Compare (QA):               npx playwright test tests/e2e/visual.spec.ts

// Nudge lazy-loaded above-the-fold images (the theme uses perfmatters
// lazy-load), then return to the top for a stable viewport capture. We
// screenshot the VIEWPORT, not the full page: these content pages are
// 5k–10k px tall, so full-page captures are slow, huge (MBs), flaky, and
// dominated by content churn. The above-the-fold region is where a plugin
// update's layout breakage shows, and it's stable.
async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

for (const route of routes) {
  test(`visual: ${route.name} [${env}]`, async ({ page }) => {
    const resp = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    // 404 route legitimately returns 404 — still screenshot the rendered 404 page.
    expect(resp, `no response for ${route.path}`).not.toBeNull();
    await settle(page);
    await expect(page).toHaveScreenshot(`${route.name}.png`, {
      mask: masks.map((sel) => page.locator(sel)),
    });
  });
}
