import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { env, adminStatePath } from "./qaConfig";

// HARD admin checks (authenticated). Uses a short-lived session minted over SSH
// — no stored password (see scripts/mint-admin-session.mjs). Plugin updates
// break wp-admin and especially the block editor far more often than the front
// end, and you'd never see it from the public site.
//
//   npm run plugin-update:admin   (mints the session, then runs this)
//
// Detect-and-skip: if no session file exists, the whole suite skips.

const hasSession = fs.existsSync(adminStatePath);
test.use(hasSession ? { storageState: adminStatePath } : {});

const FATAL_RE = /Fatal error|Parse error|There has been a critical error/i;

test.describe("admin (authenticated)", () => {
  test.skip(!hasSession, "no admin session — run: npm run plugin-update:admin (mints it over SSH)");

  test(`wp-admin dashboard loads [${env}]`, async ({ page }) => {
    await page.goto("/wp-admin/", { waitUntil: "domcontentloaded" });
    expect(page.url(), "bounced to wp-login — the minted session is invalid").not.toContain("wp-login.php");
    await expect(page.locator("#adminmenu, #wpadminbar").first(), "admin chrome should render").toBeVisible({ timeout: 15_000 });
    const txt = await page.locator("body").innerText().catch(() => "");
    expect(FATAL_RE.test(txt), `fatal/critical error on wp-admin dashboard`).toBeFalsy();
  });

  test(`block editor screen loads [${env}]`, async ({ page }) => {
    // Deterministic, server-side signal: the edit screen renders without a PHP
    // fatal and the editor container is in the DOM. NOTE: a full JS-mount check
    // isn't reliable here — the site delays JavaScript until user interaction
    // (perfmatters), so jQuery/3rd-party editor scripts don't resolve in a
    // headless run. JS-level block breakage is a manual-verify item; this catches
    // the common case (a plugin's PHP error on the edit screen).
    const resp = await page.goto("/wp-admin/post-new.php", { waitUntil: "domcontentloaded" });
    expect(page.url(), "bounced to wp-login").not.toContain("wp-login.php");
    expect(resp?.status() ?? 0, "edit screen status").toBeLessThan(400);
    const txt = await page.locator("body").innerText().catch(() => "");
    expect(FATAL_RE.test(txt), "fatal/critical on the block-editor screen").toBeFalsy();
    await expect(
      page.locator("body.block-editor-page, #editor, .block-editor, .edit-post-layout").first(),
      "the block-editor screen should render server-side",
    ).toBeAttached({ timeout: 15_000 });
  });

  test(`plugin settings page loads [${env}]`, async ({ page }) => {
    // Point PLUGIN_UPDATE_SETTINGS_PAGE at the updated plugin's settings screen, e.g.
    // "wpforms-settings", "admin.php?page=wpforms-settings", or a full
    // "/wp-admin/admin.php?page=wpforms-settings". Defaults to core general settings.
    // Normalize so a value missing the /wp-admin/ prefix doesn't resolve to the
    // site ROOT (which the host edge 403s) — a real footgun caught in a live run.
    const raw = process.env.PLUGIN_UPDATE_SETTINGS_PAGE || "/wp-admin/options-general.php";
    const settingsPath = /^https?:\/\//.test(raw) || raw.startsWith("/wp-admin/")
      ? raw
      : "/wp-admin/" + raw.replace(/^\/+/, "");
    // Warm wp-admin first: a cold direct hit to admin.php?page= can be edge-throttled.
    await page.goto("/wp-admin/", { waitUntil: "domcontentloaded" }).catch(() => {});
    const resp = await page.goto(settingsPath, { waitUntil: "domcontentloaded" });
    expect(page.url(), "bounced to wp-login").not.toContain("wp-login.php");
    expect(resp?.status() ?? 0, `${settingsPath} status`).toBeLessThan(400);
    const txt = await page.locator("body").innerText().catch(() => "");
    expect(FATAL_RE.test(txt), `fatal/critical error on ${settingsPath}`).toBeFalsy();
  });
});
