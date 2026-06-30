import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { env, ownHosts, flows, routes, selectors, probes } from "./qaConfig";

// HARD interactive layer — first-party, deterministic user flows that GATE the
// auto-rollback decision (only the visual diff stays SOFT). Safeguards that keep
// "hard" from false-firing:
//   - link checks are FIRST-PARTY only (external bot-blockers like Facebook 400
//     and staging URL-rewrite artifacts are ignored), AND
//   - link checks are BASELINE-DELTA: only links the update NEWLY breaks gate;
//     pre-existing breaks live in broken-links-baseline.json (regenerate with
//     PLUGIN_UPDATE_LINKS_UPDATE=1).
// PORTABILITY: every theme-specific selector + probe route is read from config
// (qa.selectors / qa.probes, discovered at Setup) — NONE hardcoded. A check whose
// selector/probe is not configured is SKIPPED, never failed. Embedded third-party
// flows (newsletter, Ajax) are timing-sensitive — retries:2 absorb transient
// blips; a genuine failure gates (a declared newsletter couples your rollback to
// that provider's uptime — documented trade-off; leave it undeclared to opt out).
// Every test is DETECT-AND-SKIP: absent on this site → skipped, not failed.
// Run:  npm run plugin-update:functional (HARD bucket)

const isOwn = (u: string) => {
  try { return ownHosts.includes(new URL(u).host); } catch { return false; }
};

// A single-post route from config (detect-and-skip if the site has none),
// instead of a hardcoded URL — keeps these article-scoped checks portable.
const ART = routes.find((r) => /single/i.test(`${r.name} ${r.pageType ?? ""}`))?.path ?? "";

async function skipIfAbsent(locatorCount: Promise<number>, reason: string) {
  const n = await locatorCount;
  test.skip(n === 0, reason);
}

// ---- First-party link integrity (baseline-delta: only NEW breaks gate) ------
const LINKS_BASELINE = path.join(__dirname, "broken-links-baseline.json");
const LINKS_UPDATE = process.env.PLUGIN_UPDATE_LINKS_UPDATE === "1";
const linksBaseline: Record<string, string[]> = fs.existsSync(LINKS_BASELINE) ? JSON.parse(fs.readFileSync(LINKS_BASELINE, "utf8")) : {};
const linksCollected: Record<string, string[]> = {};

async function checkLinks(key: string, scopeSel: string, page: any, request: any) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const scope = page.locator(scopeSel).first();
  await skipIfAbsent(scope.count(), `no ${key} on this site`);
  const hrefs: string[] = await scope.locator("a[href]").evaluateAll((els: any[]) =>
    Array.from(new Set(els.map((a) => (a as HTMLAnchorElement).href))));
  const targets = hrefs.filter((h) => /^https?:\/\//.test(h) && !h.includes("#") && isOwn(h));
  // Key broken links by STATUS + PATHNAME (host-independent) so the SAME baseline
  // works on staging AND prod (else the prod smoke sees every pre-existing break
  // as "new" and false-gates). Display keeps the full URL.
  const broken: { url: string; key: string }[] = [];
  for (const url of targets) {
    const r = await request.get(url, { failOnStatusCode: false, timeout: 20_000 }).catch(() => null);
    const s = r?.status() ?? 0;
    if (s === 0 || s >= 400) {
      let p = url;
      try { const u = new URL(url); p = u.pathname + u.search; } catch { /* keep url */ }
      broken.push({ url: `${s} ${url}`, key: `${s} ${p}` });
    }
  }
  linksCollected[key] = broken.map((b) => b.key).sort();
  test.skip(LINKS_UPDATE, "updating broken-links baseline");
  const accepted = new Set(linksBaseline[key] || []);
  const netNew = broken.filter((b) => !accepted.has(b.key));
  expect(netNew.map((b) => b.url), `NEW broken first-party ${key} link(s) (gates auto-rollback):\n${netNew.map((b) => b.url).join("\n")}\n(${accepted.size} pre-existing path(s) accepted in baseline)`).toHaveLength(0);
}

test(`nav menu links resolve [${env}]`, async ({ page, request }) => {
  test.skip(!selectors.navWrapper, "no qa.selectors.navWrapper configured");
  await checkLinks("nav", selectors.navWrapper, page, request);
});
test(`footer links resolve [${env}]`, async ({ page, request }) => {
  test.skip(!selectors.footer, "no qa.selectors.footer configured");
  await checkLinks("footer", selectors.footer, page, request);
});
test.afterAll(() => {
  if (LINKS_UPDATE) fs.writeFileSync(LINKS_BASELINE, JSON.stringify(linksCollected, null, 2) + "\n");
});

// ---- Dropdown / mega-menu ---------------------------------------------------
test(`nav dropdown opens [${env}]`, async ({ page }) => {
  test.skip(!selectors.navDropdownToggle || !selectors.navSubmenuContainer, "no nav dropdown selectors configured");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const toggle = page.locator(selectors.navDropdownToggle).first();
  await skipIfAbsent(toggle.count(), "no dropdown submenus");
  await toggle.click();
  await expect(
    page.locator(selectors.navSubmenuContainer).first(),
    "submenu should open",
  ).toBeVisible({ timeout: 6000 });
});

// ---- CTA anchor buttons jump to a real section ------------------------------
test(`anchor CTA buttons target real sections [${env}]`, async ({ page }) => {
  test.skip(!selectors.ctaButton, "no qa.selectors.ctaButton configured");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const anchors: string[] = await page.locator(selectors.ctaButton).evaluateAll((els) =>
    els.map((a) => (a as HTMLAnchorElement).getAttribute("href") || "").filter((h) => h.length > 1),
  );
  await skipIfAbsent(Promise.resolve(anchors.length), "no in-page anchor CTAs");
  const missing: string[] = [];
  for (const href of anchors) {
    const id = href.slice(1);
    if ((await page.locator(`#${CSS.escape ? CSS.escape(id) : id}, [name="${id}"]`).count()) === 0) missing.push(href);
  }
  expect(missing, `anchor CTAs with no matching target:\n${missing.join("\n")}`).toHaveLength(0);
});

// ---- Social share (single article) -----------------------------------------
test(`social share renders [${env}]`, async ({ page }) => {
  test.skip(!ART, "no single-post route configured");
  test.skip(!selectors.shareBlock, "no qa.selectors.shareBlock configured");
  await page.goto(ART, { waitUntil: "domcontentloaded" });
  const share = page.locator(selectors.shareBlock).first();
  await skipIfAbsent(share.count(), "no share block");
  const controlSel = selectors.shareControls || "a, button";
  expect(await share.locator(controlSel).count(), "share controls should be present").toBeGreaterThan(0);
});

// ---- Table of contents anchors (single article) ----------------------------
test(`table of contents anchors resolve [${env}]`, async ({ page }) => {
  test.skip(!ART, "no single-post route configured");
  test.skip(!selectors.tableOfContents, "no qa.selectors.tableOfContents configured");
  await page.goto(ART, { waitUntil: "domcontentloaded" });
  const toc = page.locator(selectors.tableOfContents).first();
  await skipIfAbsent(toc.count(), "no table of contents on this article");
  const anchors: string[] = await toc.locator("a[href^='#']").evaluateAll((els) =>
    els.map((a) => (a as HTMLAnchorElement).getAttribute("href") || "").filter((h) => h.length > 1),
  );
  const missing: string[] = [];
  for (const href of anchors) {
    const id = href.slice(1);
    const sel = CSS.escape ? CSS.escape(id) : id;
    if ((await page.locator(`#${sel}, [name="${id}"]`).count()) === 0) missing.push(href);
  }
  expect(missing, `TOC links with no matching heading:\n${missing.join("\n")}`).toHaveLength(0);
});

// ---- Image lightbox (single article) ---------------------------------------
test(`image lightbox opens [${env}]`, async ({ page }) => {
  test.skip(!ART, "no single-post route configured");
  test.skip(!selectors.lightboxTrigger || !selectors.lightboxOverlay, "no lightbox selectors configured");
  await page.goto(ART, { waitUntil: "domcontentloaded" });
  const opener = page.locator(selectors.lightboxTrigger).first();
  await skipIfAbsent(opener.count(), "no lightbox-enabled images");
  await opener.click();
  await expect(page.locator(selectors.lightboxOverlay).first(), "lightbox should open").toBeVisible({ timeout: 6000 });
});

// ---- Section filter (e.g. an events keyword filter) -------------------------
test(`archive keyword filter updates results [${env}]`, async ({ page }) => {
  test.skip(!probes.eventsArchivePath || !selectors.eventsFilterInput, "no archive-filter probe configured (qa.probes.eventsArchivePath + qa.selectors.eventsFilterInput)");
  await page.goto(probes.eventsArchivePath, { waitUntil: "domcontentloaded" });
  const input = page.locator(selectors.eventsFilterInput).first();
  await skipIfAbsent(input.count(), "no filter input on this archive");
  const listing = page.locator(selectors.eventsListingContainer || selectors.eventsFilterInput).first();
  await input.fill(probes.eventsFilterQuery || "the");
  await input.press("Enter");
  await page.waitForTimeout(3000); // Ajax re-query
  // Either results re-render or a clean empty state — must not error/WSOD
  await expect(page.locator("body")).not.toContainText("There has been a critical error");
  await expect(listing, "listing should still render after filtering").toBeVisible();
});

// ---- Load more ("View More" / Ajax Load More) ------------------------------
test(`load-more loads additional items [${env}]`, async ({ page }) => {
  test.skip(!probes.loadMoreArchivePath || !selectors.loadMoreWrap, "no load-more probe configured (qa.probes.loadMoreArchivePath + qa.selectors.loadMoreWrap)");
  await page.goto(probes.loadMoreArchivePath, { waitUntil: "domcontentloaded" });
  const wrap = page.locator(selectors.loadMoreWrap).first();
  await skipIfAbsent(wrap.count(), "no load-more on this archive");
  const items = wrap.locator(selectors.loadMoreItems || "> *");
  const before = await items.count();
  const btn = wrap.locator(selectors.loadMoreButton || "button").first();
  await skipIfAbsent(btn.count(), "no load-more button (all items already shown)");
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect.poll(() => items.count(), { message: "more items should load", timeout: 15_000 }).toBeGreaterThan(before);
});

// ---- Event-submission form (config-declared, render only) -------------------
// Only runs if the project DECLARES it has one (qa.flows.submitEvent = its path,
// auto-detected at Setup). Generic: asserts a real submission form renders at
// that path (a <form> with several fields + a submit) — NOT tied to any one
// events plugin's markup, so it's portable across sites.
test(`event-submission form renders [${env}]`, async ({ page }) => {
  const flowPath = flows.submitEvent;
  test.skip(!flowPath, "no event-submission flow declared (qa.flows.submitEvent)");
  await page.goto(flowPath!, { waitUntil: "domcontentloaded" });
  const hasForm = await page.evaluate(() =>
    Array.from(document.querySelectorAll("form")).some((f) => {
      const fields = f.querySelectorAll("input, select, textarea").length;
      const submit = f.querySelector('[type="submit"], button[type="submit"], .eo-event-form-submit');
      return fields >= 2 && !!submit; // a real submission form, not the 1-field header search
    }),
  );
  expect(hasForm, `expected an event-submission form (form with fields + submit) at ${flowPath}`).toBeTruthy();
});

// ---- Newsletter signup (embedded, often third-party — HARD by choice) -------
// Declared via qa.selectors.newsletterSignup. A declared newsletter render GATES
// (retries:2 absorb transient blips; a real outage rolls back — documented
// coupling to a third party's uptime). Leave the selector undeclared to opt out.
test(`newsletter signup renders [${env}]`, async ({ page }) => {
  test.skip(!selectors.newsletterSignup, "no qa.selectors.newsletterSignup configured");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const form = page.locator(selectors.newsletterSignup).first();
  await skipIfAbsent(page.locator(selectors.newsletterSignup).count(), "no newsletter signup present");
  await expect(form, "newsletter form should render (embedded)").toBeVisible({ timeout: 25_000 });
  const emailSel = selectors.newsletterEmailField || 'input[type="email"], input[name="email"]';
  await expect(form.locator(emailSel).first(), "newsletter email field should render").toBeVisible();
});
