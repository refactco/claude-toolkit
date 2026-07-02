import { test, expect, type Page, type Locator } from "@playwright/test";
import { env, routes } from "./qaConfig";
import {
  nativeForms, readFormInfo, fillForm, submitAndConfirm, hasCaptcha, unfilledRequired,
  triggerLazyForms, QA_MARKER, type FormPlugin,
} from "./lib/forms";

// SOFT real-submit layer — actually FILLS + SUBMITS every real form, generically,
// on staging AND production (post-promote smoke). It exercises the REAL path:
// the live captcha and live email are left in place (by project decision), so:
//   - every value is stamped "QA-TEST" → entries/leads are filterable; and
//   - this layer is SOFT: it NEVER auto-rolls-back. A real captcha can block an
//     automated submit at random, so a block is reported "inconclusive" (skip),
//     and even a clear submit failure only FLAGS for a human — it never gates.
// HARD form coverage (does the form still render with its fields) is in
// forms.spec.ts. Third-party embeds (HubSpot/Mailchimp) are render-only there
// and skipped here (not ours to submit against). Forms behind a login are NOT
// discovered (unauthenticated navigation only) — a documented coverage gap.
//
// Run:  npm run plugin-update:forms-submit       (advisory / SOFT)

type Work = { routePath: string; index: number; formKey: string; plugin: FormPlugin; sig: string };
type Result = { form: string; result: string; detail: string };

function isCommentForm(action: string, id: string): boolean {
  return /wp-comments-post\.php/i.test(action) || id === "commentform";
}

/** Re-find a form after a fresh page load: by id/name when known, else by index. */
function relocate(page: Page, w: Work): Locator {
  if (w.formKey) {
    const byKey = page.locator(`form[id="${w.formKey}"], form[name="${w.formKey}"]`).first();
    return byKey;
  }
  return nativeForms(page).nth(w.index);
}

test(`real form submissions succeed (SOFT — flags, never rolls back) [${env}]`, async ({ page }) => {
  const results: Result[] = [];
  const work: Work[] = [];
  const seen = new Set<string>();

  // ---- Pass 1: discover a deduped worklist of REAL, submittable forms --------
  for (const r of routes) {
    await page.goto(r.path, { waitUntil: "domcontentloaded" }).catch(() => {});
    await triggerLazyForms(page);
    const formEls = await nativeForms(page).all().catch(() => []);
    for (let i = 0; i < formEls.length; i++) {
      const f = formEls[i];
      const info = await readFormInfo(f).catch(() => null);
      if (!info || info.thirdParty || !info.hasSubmit) continue;
      const { action, id, hasEmail } = await f.evaluate((el) => ({
        action: el.getAttribute("action") || "",
        id: el.id || "",
        hasEmail: !!el.querySelector("input[type='email'], input[name*='email' i]"),
      })).catch(() => ({ action: "", id: "", hasEmail: false }));
      const sig = `${info.plugin}|${info.formKey}|${info.requiredKeys.join(",")}|${info.fieldCount}`;
      if (seen.has(sig)) continue;                         // same form on many pages → handle once
      seen.add(sig);
      if (isCommentForm(action, id)) {                     // comment forms → skip (moderation noise), but report it
        results.push({ form: `comment-form @ ${r.path}`, result: "inconclusive", detail: "WP comment form — skipped (would create moderation noise)" });
        continue;
      }
      if (info.plugin === "generic" && !hasEmail) continue; // only real contact/lead/newsletter forms
      work.push({ routePath: r.path, index: i, formKey: info.formKey, plugin: info.plugin, sig });
    }
  }

  test.skip(work.length === 0 && results.length === 0, "no forms found on this site (all absent / third-party)");

  // ---- Pass 2: submit each once (fresh page load per form) -------------------
  for (const w of work) {
    const label = `${w.plugin}${w.formKey ? ` #${w.formKey}` : ""} @ ${w.routePath}`;
    await page.goto(w.routePath, { waitUntil: "domcontentloaded" }).catch(() => {});
    await triggerLazyForms(page);
    let form = relocate(page, w);
    if ((await form.count().catch(() => 0)) === 0) form = nativeForms(page).nth(w.index); // fallback
    if ((await form.count().catch(() => 0)) === 0) {
      results.push({ form: label, result: "inconclusive", detail: "form not found on reload" });
      continue;
    }
    if (await hasCaptcha(form)) {
      results.push({ form: label, result: "inconclusive", detail: "captcha present — real submit not exercised (kept by design)" });
      continue;
    }
    const fill = await fillForm(form);
    // Multi-step / conditional forms: required fields still empty after a single
    // pass → we can't honestly submit; report inconclusive (never a false fail).
    const missing = await unfilledRequired(form);
    if (missing.length) {
      results.push({ form: label, result: "inconclusive", detail: `filled ${fill.filled}; required field(s) still empty after fill — likely conditional/multi-step: ${missing.slice(0, 5).join(", ")}` });
      continue;
    }
    const verdict = await submitAndConfirm(page, form, w.plugin);
    results.push({ form: label, result: verdict.result, detail: `filled ${fill.filled} field(s); ${verdict.detail}` });
  }

  // ---- Report. SOFT: only a CLEAR error flags (soft); skips never fail. ------
  const lines = results.map((r) => `  [${r.result.toUpperCase()}] ${r.form} — ${r.detail}`);
  // eslint-disable-next-line no-console
  console.log(`\nForm submit results (marker="${QA_MARKER}", env=${env}):\n${lines.join("\n")}\n`);

  for (const r of results) {
    // expect.soft → every form is reported; the run is non-zero only if a real
    // submit clearly FAILED. Inconclusive/captcha are informational, not failures.
    expect.soft(r.result, `${r.form}: ${r.detail}`).not.toBe("error");
  }
});
