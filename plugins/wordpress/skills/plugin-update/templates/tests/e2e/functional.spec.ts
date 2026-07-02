import { test, expect } from "@playwright/test";
import { env, selectors, probes } from "./qaConfig";

// HARD functional layer — deterministic, side-effect-free flows that gate the
// auto-rollback decision. More interactive flows are in interactive.spec.ts
// (also HARD); only the visual diff is SOFT. Real form submissions live in
// forms-submit.spec.ts (on-demand). Run:  npm run plugin-update:functional
// PORTABILITY: search + hamburger selectors and the search queries come from
// config (qa.selectors / qa.probes, discovered at Setup) — none hardcoded. A
// check whose selector/probe is absent is SKIPPED, never failed.

// ---- Search -----------------------------------------------------------------
// Note: we use domcontentloaded + explicit element waits, never `networkidle`
// — these pages run ads/analytics/embeds that keep the network busy forever,
// so networkidle is flaky and can stall the whole test.
test(`search returns results for a matching query [${env}]`, async ({ page }) => {
  test.skip(!selectors.searchResults || !probes.searchQuery, "no search probe configured (qa.selectors.searchResults + qa.probes.searchQuery)");
  await page.goto(`/?s=${encodeURIComponent(probes.searchQuery)}`, { waitUntil: "domcontentloaded" });
  const results = page.locator(selectors.searchResults);
  await expect(results, "search results container should render").toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => results.locator("a").count(), { message: "search should surface result links", timeout: 25_000 })
    .toBeGreaterThan(0);
  if (selectors.searchEmptyState) {
    await expect(page.locator(selectors.searchEmptyState).first(), "no-results must be hidden when there are matches").toBeHidden();
  }
});

test(`search shows the empty state for a non-matching query [${env}]`, async ({ page }) => {
  test.skip(!selectors.searchResults || !probes.searchNoMatchQuery, "no empty-state probe configured (qa.selectors.searchResults + qa.probes.searchNoMatchQuery)");
  await page.goto(`/?s=${encodeURIComponent(probes.searchNoMatchQuery)}`, { waitUntil: "domcontentloaded" });
  await page.locator(selectors.searchResults).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const linkCount = await page.locator(`${selectors.searchResults} a`).count();
  const emptyVisible = selectors.searchEmptyState
    ? await page.locator(selectors.searchEmptyState).first().isVisible().catch(() => false)
    : false;
  expect(emptyVisible || linkCount === 0, `expected empty state for a nonsense query (links=${linkCount})`).toBeTruthy();
});

// ---- Mobile menu (hamburger) ------------------------------------------------
test(`mobile hamburger menu opens and exposes nav links [${env}]`, async ({ page }) => {
  test.skip(!selectors.hamburgerButton || !selectors.mobileNavLinks, "no hamburger selectors configured (qa.selectors.hamburgerButton + qa.selectors.mobileNavLinks)");
  await page.setViewportSize({ width: 393, height: 851 }); // phone
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const opener = page.locator(selectors.hamburgerButton).first();
  await expect(opener, "hamburger button should be visible at phone width").toBeVisible();
  await opener.click();
  const navLink = page.locator(selectors.mobileNavLinks).first();
  await expect(navLink, "opening the hamburger should reveal nav links").toBeVisible({ timeout: 8000 });
});

// (Form render coverage lives in forms.spec.ts — generic across all plugins,
// baseline-delta, no hardcoded page/id.)
