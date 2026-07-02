import { test, expect } from "@playwright/test";
import { routes, env, ownHosts } from "./qaConfig";

// HARD per-page health — runs across EVERY main page (one per page type). A page
// is "functional" if it: returns a non-error status (404 route excepted), is not
// a WSOD, renders real content, throws no uncaught JS error, loads its own
// (first-party) assets and images without 4xx/5xx, and shows no leaked PHP-error
// / mojibake text. First-party scoping (ownHosts) keeps third-party ad/analytics
// noise from causing false failures. console.error is reported, not failed.
//
// Run:  npm run plugin-update:functional   (bundles functional + health)

const isOwn = (url: string) => {
  try {
    return ownHosts.includes(new URL(url).host);
  } catch {
    return false;
  }
};

const LEAK_RE = /(Fatal error:|Parse error:|Warning:[^\n]{0,120}\bin\b[^\n]{0,140}\.php|Notice:[^\n]{0,120}\bin\b[^\n]{0,140}\.php|�)/;

for (const route of routes) {
  test(`health: ${route.name} [${env}]`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedAssets: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("response", (r) => {
      const u = r.url();
      // first-party sub-resources only; the top-level document is asserted separately
      if (r.request().resourceType() !== "document" && isOwn(u) && r.status() >= 400) {
        failedAssets.push(`${r.status()} ${u}`);
      }
    });

    const resp = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    const status = resp?.status() ?? 0;
    if (route.name === "not-found") expect(status, "404 route should return 404").toBe(404);
    else expect(status, `${route.path} returned HTTP ${status}`).toBeLessThan(400);

    // WSOD / critical error
    await expect(page.locator("body"), "page is a WSOD / critical-error screen").not.toContainText("There has been a critical error");

    // real content present
    const bodyText = (await page.locator("body").innerText().catch(() => "")).trim();
    expect(bodyText.length, `${route.path} body looks empty (shell only)`).toBeGreaterThan(200);

    // leaked PHP-error / mojibake in rendered text
    const leak = bodyText.match(LEAK_RE);
    expect(leak, `${route.path} shows leaked error/garbled text: ${leak?.[0]}`).toBeNull();

    // settle a moment for late assets, then assert no first-party broken images
    await page.waitForTimeout(600);
    const brokenImgs: string[] = await page.evaluate((hosts) => {
      const out: string[] = [];
      for (const img of Array.from(document.images)) {
        if (!img.currentSrc) continue;
        let host = "";
        try { host = new URL(img.currentSrc).host; } catch { continue; }
        if (hosts.includes(host) && img.complete && img.naturalWidth === 0) out.push(img.currentSrc);
      }
      return out;
    }, ownHosts);

    if (consoleErrors.length) {
      console.log(`  [health:${route.name}] ${consoleErrors.length} console error(s) (informational)`);
    }
    expect(pageErrors, `uncaught JS error(s) on ${route.path}:\n${pageErrors.join("\n")}`).toHaveLength(0);
    expect(failedAssets, `first-party asset(s) failed to load on ${route.path}:\n${failedAssets.join("\n")}`).toHaveLength(0);
    expect(brokenImgs, `broken first-party image(s) on ${route.path}:\n${brokenImgs.join("\n")}`).toHaveLength(0);
  });
}
