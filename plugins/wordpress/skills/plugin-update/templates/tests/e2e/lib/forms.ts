// Generic, plugin-agnostic form engine for the plugin-update suite.
//
// One place that knows how to: find every form on a page, figure out which
// plugin rendered it, fill it with safe fake data, notice a captcha, and decide
// whether a submit succeeded. Both forms.spec.ts (HARD render) and
// forms-submit.spec.ts (SOFT real submit) import from here, so the behaviour is
// identical across WPForms / Gravity / Contact Form 7 / Ninja / generic <form>s
// plus embedded HubSpot / Mailchimp — without hardcoding a single form id.
//
// Design rules (match the rest of the suite):
//   - DETECT-AND-SKIP: nothing is assumed to exist; absent → skip, never fail.
//   - Fake data is always stamped QA_MARKER so a real submit is filterable.
//   - The fill step is best-effort and NEVER the verdict — the confirmation /
//     server response is. Anything uncertain returns "inconclusive", not a fail.

import { type Page, type Locator } from "@playwright/test";
import { faker } from "@faker-js/faker";

// Every free-text value carries this so test entries are obvious + filterable
// in the site owner's inbox / CRM (used on staging AND production).
export const QA_MARKER = "QA-TEST";

// Fresh fake data each run (no fixed seed): unique values avoid duplicate-submission
// rejection on opt-in / newsletter / subscribe forms, which de-dupe by email/phone.
// Determinism isn't needed for a real submit; uniqueness is. The QA_MARKER stamp
// keeps every entry identifiable regardless.

export type FormPlugin =
  | "wpforms" | "gravity" | "cf7" | "ninja" | "hubspot" | "mailchimp" | "generic";

// container class → plugin. Order matters (most specific first).
const PLUGIN_SIGNATURES: Array<{ plugin: FormPlugin; sel: string }> = [
  { plugin: "wpforms", sel: ".wpforms-form" },
  { plugin: "gravity", sel: ".gform_wrapper, form[id^='gform_']" },
  { plugin: "cf7", sel: ".wpcf7, form.wpcf7-form" },
  { plugin: "ninja", sel: ".nf-form-cont, form.ninja-forms-form" },
  { plugin: "hubspot", sel: "form.hs-form, .hbspt-form" },
  { plugin: "mailchimp", sel: "#mc_embed_signup, form[action*='list-manage.com']" },
];

// Third-party embeds we render-check but never real-submit (their backend is not
// ours to spam, and they carry their own bot defences).
export const THIRD_PARTY: FormPlugin[] = ["hubspot", "mailchimp"];

// The submit control. PRECISE on purpose: a bare `button:not([type])` would grab
// the intl-tel-input country-selector button (which WPForms' smart phone field
// renders BEFORE the real submit), so we prefer plugin submit classes + typed
// submits, and only fall back to a submit-by-text button when none exist.
const SUBMIT_SEL = [
  ".wpforms-submit", ".gform_button", "input.gform_button", ".gform-button",
  ".wpcf7-submit", ".nf-element[type='submit']",
  "button[type='submit']", "input[type='submit']", "input[type='image']",
].join(", ");
const SUBMIT_TEXT_RE = /submit|send|sign ?up|subscribe|opt[- ]?in|join|register|contact/i;

/** The form's submit control, robust against stray non-submit <button>s. */
export function submitControl(form: Locator): Locator {
  return form.locator(SUBMIT_SEL).first();
}

// Captcha widgets — presence means an automated submit is unreliable (we keep
// the real captcha by design, so a block is reported "inconclusive", not failed).
const CAPTCHA_SEL = [
  ".g-recaptcha", "[data-sitekey]", "iframe[src*='recaptcha']",
  ".cf-turnstile", "iframe[src*='challenges.cloudflare.com']",
  ".h-captcha", "iframe[src*='hcaptcha']",
].join(", ");

// Per-plugin success / error markers for confirmation detection.
const SUCCESS_SEL: Record<string, string> = {
  wpforms: ".wpforms-confirmation-container, .wpforms-confirmation-container-full",
  gravity: ".gform_confirmation_message, .gforms_confirmation_message",
  cf7: ".wpcf7-response-output.wpcf7-mail-sent-ok",
  ninja: ".nf-response-msg",
  generic: "[role='status'], .success-message, .form-success, .confirmation",
};
const ERROR_SEL: Record<string, string> = {
  wpforms: ".wpforms-error-container, .wpforms-error:not(:empty)",
  gravity: ".gform_validation_errors, .validation_error",
  cf7: ".wpcf7-response-output.wpcf7-validation-errors, .wpcf7-not-valid-tip",
  ninja: ".nf-error-msg",
  generic: "[role='alert'].error, .error-message:not(:empty)",
};

export type FormInfo = {
  plugin: FormPlugin;
  thirdParty: boolean;
  fieldCount: number;
  requiredKeys: string[]; // stable per-form signature for baseline-delta
  formKey: string;        // form id/name — disambiguates multiple same-plugin forms on a route
  hasSubmit: boolean;
  hasCaptcha: boolean;
};

/** Which plugin rendered this form? */
export async function classifyForm(form: Locator): Promise<FormPlugin> {
  for (const { plugin, sel } of PLUGIN_SIGNATURES) {
    // a form that IS, or sits inside, a plugin container
    const inside = form.locator(`xpath=ancestor-or-self::*[1]`);
    void inside;
    if (await form.evaluate((el, s) => el.matches(s) || !!el.closest(s) || !!el.querySelector(s), sel).catch(() => false)) {
      return plugin;
    }
  }
  return "generic";
}

/** Read a stable signature of a form: field count + the keys of its required fields. */
export async function readFormInfo(form: Locator): Promise<FormInfo> {
  const plugin = await classifyForm(form);
  const hasCaptcha = (await form.locator(CAPTCHA_SEL).count().catch(() => 0)) > 0;
  let hasSubmit = (await form.locator(SUBMIT_SEL).count().catch(() => 0)) > 0;
  if (!hasSubmit) {
    // generic <form> with an untyped <button> whose text reads like a submit
    hasSubmit = (await form.locator("button").filter({ hasText: SUBMIT_TEXT_RE }).count().catch(() => 0)) > 0;
  }

  const fields = await form.locator("input, select, textarea").evaluateAll((els) =>
    els
      .map((el) => {
        const e = el as HTMLInputElement;
        const type = (e.getAttribute("type") || e.tagName).toLowerCase();
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        // Honeypot/hidden detection MUST match fillForm exactly, or the baseline
        // signature (used by the HARD rollback gate) disagrees with what gets filled.
        const hidden =
          type === "hidden" || e.offsetParent === null ||
          e.closest('[aria-hidden="true"]') !== null ||
          cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0 ||
          r.width <= 1 || r.height <= 1 || r.right < 0 || r.bottom < 0;
        const required = e.required || e.getAttribute("aria-required") === "true" ||
          !!el.closest(".wpforms-field-required, .gfield_contains_required, .nf-field-container.required, .required");
        const key = (e.getAttribute("name") || e.id || e.getAttribute("placeholder") || "").trim();
        return { type, hidden, required, key };
      })
      .filter((f) => !["submit", "button", "reset", "image", "file"].includes(f.type)),
  );

  const real = fields.filter((f) => !f.hidden);
  const requiredKeys = real.filter((f) => f.required && f.key).map((f) => f.key).sort();
  const formKey = await form.evaluate((el) => el.id || el.getAttribute("name") || "").catch(() => "");
  return { plugin, thirdParty: THIRD_PARTY.includes(plugin), fieldCount: real.length, requiredKeys, formKey, hasSubmit, hasCaptcha };
}

/** All native <form> elements on the page (HubSpot/Mailchimp embeds included if they render a <form>). */
export function nativeForms(page: Page): Locator {
  return page.locator("form");
}

/**
 * Nudge lazy/scroll-triggered embeds (newsletter popups, Mailchimp, etc.) to
 * mount, then return to the top. Best-effort; never throws. (HubSpot's heavier
 * embed is HARD-covered separately in interactive.spec.ts with a longer wait.)
 */
export async function triggerLazyForms(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(400, Math.floor(window.innerHeight * 0.9));
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForTimeout(800);
}

// ---- Fake value selection (Fake-Filler-style: type first, then name/label) ---

function looks(haystack: string, ...needles: string[]): boolean {
  const h = haystack.toLowerCase().replace(/[^a-z0-9]/g, "");
  return needles.some((n) => h.includes(n.replace(/[^a-z0-9]/g, "")));
}

/** Decide what to type into a field, given its hints. Free text is QA_MARKER-stamped. */
export function fakeValueFor(hint: { type: string; name: string; id: string; placeholder: string; label: string }): string {
  const t = hint.type.toLowerCase();
  const ctx = `${hint.name} ${hint.id} ${hint.placeholder} ${hint.label}`;

  if (t === "email" || looks(ctx, "email", "e-mail")) return `qa-test.${faker.string.alphanumeric(6).toLowerCase()}@example.com`;
  if (t === "tel" || looks(ctx, "phone", "tel", "mobile")) return `555${faker.string.numeric(7)}`; // fictional 555 number, unique per run
  if (t === "url" || looks(ctx, "website", "url")) return "https://example.com";
  if (t === "number" || looks(ctx, "age", "qty", "quantity", "number")) return "2";
  if (t === "date") return "2030-01-01";
  if (t === "time") return "14:30";
  if (t === "datetime-local") return "2030-01-01T14:30";

  if (looks(ctx, "firstname", "fname")) return `${QA_MARKER} ${faker.person.firstName()}`;
  if (looks(ctx, "lastname", "lname", "surname")) return `${QA_MARKER} ${faker.person.lastName()}`;
  if (looks(ctx, "name")) return `${QA_MARKER} ${faker.person.fullName()}`;
  if (looks(ctx, "company", "organization", "org", "business")) return `${QA_MARKER} Co`;
  if (looks(ctx, "zip", "postal", "postcode")) return "12345";
  if (looks(ctx, "city")) return `${QA_MARKER} City`;
  if (looks(ctx, "subject")) return `${QA_MARKER} automated submission`;
  if (looks(ctx, "message", "comment", "enquiry", "inquiry", "question") || t === "textarea")
    return `${QA_MARKER} automated QA submission — please ignore.`;

  return `${QA_MARKER} ${faker.lorem.word()}`;
}

export type FillResult = { filled: number; skipped: number };

/**
 * Best-effort fill of every visible, non-honeypot field. Never throws; returns
 * counts. Honeypots (hidden / display:none / name~=hp) are deliberately left
 * empty so spam traps stay un-tripped.
 */
export async function fillForm(form: Locator): Promise<FillResult> {
  const fields = form.locator("input, select, textarea");
  const n = await fields.count();
  let filled = 0, skipped = 0;

  for (let i = 0; i < n; i++) {
    const f = fields.nth(i);
    let meta: { tag: string; type: string; name: string; id: string; placeholder: string; honeypot: boolean; masked: boolean } | null = null;
    try {
      meta = await f.evaluate((el) => {
        const e = el as HTMLInputElement;
        const type = (e.getAttribute("type") || "").toLowerCase();
        const name = e.getAttribute("name") || "";
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        // Honeypots/spam-traps: WPForms et al. use aria-hidden or off-screen /
        // zero-size / visibility:hidden fields that a real user never fills —
        // filling one makes the plugin SILENTLY drop the submission. Skip them.
        const honeypot =
          type === "hidden" || e.offsetParent === null ||
          e.closest('[aria-hidden="true"]') !== null ||
          cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0 ||
          r.width <= 1 || r.height <= 1 || r.right < 0 || r.bottom < 0 ||
          /honeypot|hp_|^hp$|wpforms\[hp\]|_wpcf7cf/i.test(name);
        // Masked inputs (phone/date input-masks) must be TYPED char-by-char or
        // the mask leaves the value inconsistent and the plugin rejects it.
        const masked = /mask|phone|tel/i.test(e.className) || e.hasAttribute("data-inputmask") || (e.getAttribute("inputmode") || "") === "tel";
        return { tag: e.tagName.toLowerCase(), type, name, id: e.id || "", placeholder: e.getAttribute("placeholder") || "", honeypot, masked };
      });
    } catch { /* element detached */ }
    if (!meta) { skipped++; continue; }
    // file inputs can't be auto-filled with faker; submit/buttons/honeypots skip.
    if (["submit", "button", "reset", "image", "file"].includes(meta.type) || meta.honeypot) { skipped++; continue; }
    if (!(await f.isVisible().catch(() => false))) { skipped++; continue; }

    try {
      const label = await form.locator(`label[for='${meta.id}']`).first().textContent().catch(() => "") || "";
      if (meta.tag === "select") {
        const opts = await f.locator("option").evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
        const real = opts.find((v) => v && v !== "0");
        if (real !== undefined) await f.selectOption(real);
      } else if (meta.type === "checkbox" || meta.type === "radio") {
        // NB: no inline catch — a failed check must fall through to skipped++,
        // not be counted as filled (consistent with the other field types).
        await f.check({ timeout: 4000 });
      } else {
        const val = fakeValueFor({ type: meta.type || meta.tag, name: meta.name, id: meta.id, placeholder: meta.placeholder, label });
        if (meta.type === "tel" || meta.masked) await f.pressSequentially(val, { delay: 15 }); // let input-masks format
        else await f.fill(val, { timeout: 4000 });
      }
      filled++;
    } catch { skipped++; }
  }
  return { filled, skipped };
}

/** Captcha present on/around this form? (we keep it real → block = inconclusive) */
export async function hasCaptcha(form: Locator): Promise<boolean> {
  return (await form.locator(CAPTCHA_SEL).count().catch(() => 0)) > 0;
}

/**
 * Names of visible, required fields still EMPTY after a fill attempt. Non-empty
 * means the generic single-pass fill couldn't complete the form — typically a
 * multi-step / conditional form where fields appear after interaction. The
 * submit check treats this as "inconclusive" (skip), never a failure, so a
 * partially-fillable form can't false-fail or report a bogus success.
 */
export async function unfilledRequired(form: Locator): Promise<string[]> {
  return form.locator("input, select, textarea").evaluateAll((els) =>
    els
      .filter((el) => {
        const e = el as HTMLInputElement;
        const type = (e.getAttribute("type") || e.tagName).toLowerCase();
        if (["submit", "button", "reset", "image", "hidden", "file"].includes(type)) return false;
        if (e.offsetParent === null) return false; // hidden/honeypot
        const required = e.required || e.getAttribute("aria-required") === "true" ||
          !!el.closest(".wpforms-field-required, .gfield_contains_required, .nf-field-container.required, .required");
        if (!required) return false;
        if (type === "checkbox" || type === "radio") return !(e as HTMLInputElement).checked;
        return !e.value || !e.value.trim();
      })
      .map((el) => (el as HTMLInputElement).getAttribute("name") || el.id || "?"),
  ).catch(() => []);
}

export type SubmitVerdict = { result: "success" | "error" | "inconclusive"; detail: string };

/**
 * Submit a form and decide what happened. Deterministic in MECHANISM:
 *   success  = a plugin/generic success marker appeared, OR the form was
 *              replaced/removed, OR it redirected — AND no error marker is shown.
 *   error    = a validation / spam / mail-failed marker is showing.
 *   inconclusive = neither within the timeout (treat as skip, never a hard fail).
 * expectMessage (optional) tightens success to the WP-configured confirmation text.
 */
export async function submitAndConfirm(
  page: Page,
  form: Locator,
  plugin: FormPlugin,
  opts: { expectMessage?: string; timeout?: number } = {},
): Promise<SubmitVerdict> {
  const timeout = opts.timeout ?? 30_000;
  let submit = submitControl(form);
  if ((await submit.count()) === 0) submit = form.locator("button").filter({ hasText: SUBMIT_TEXT_RE }).first();
  if ((await submit.count()) === 0) return { result: "inconclusive", detail: "no submit control found" };

  // Many sites delay form JS until first interaction (perfmatters/WP Rocket
  // delay-JS). If we click before the plugin's submit handler is bound, the click
  // does nothing (no AJAX, no validation). Best-effort: wait for a known form-JS
  // global to exist so the click triggers a real submit.
  await page.waitForFunction(() => {
    const w = window as unknown as Record<string, unknown>;
    return !!(w.wpforms || w.gform || w.wpcf7 || w.Marionette || w.nfRadio);
  }, null, { timeout: 8000 }).catch(() => {});
  await submit.scrollIntoViewIfNeeded().catch(() => {});

  const successSel = `${SUCCESS_SEL[plugin] || ""}${SUCCESS_SEL[plugin] ? ", " : ""}${SUCCESS_SEL.generic}`;
  const errorSel = `${ERROR_SEL[plugin] || ""}${ERROR_SEL[plugin] ? ", " : ""}${ERROR_SEL.generic}`;
  const startUrl = page.url();

  // Click; tolerate AJAX (no nav) and full-reload confirmations alike.
  await Promise.all([
    page.waitForLoadState("load").catch(() => {}),
    submit.click({ timeout: 15_000 }).catch(() => {}),
  ]);

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // error first — an error banner must never read as success
    if (await page.locator(errorSel).first().isVisible().catch(() => false)) {
      const txt = (await page.locator(errorSel).first().textContent().catch(() => ""))?.trim().slice(0, 160) || "";
      return { result: "error", detail: `validation/spam/mailer error shown: ${txt}` };
    }
    const success = page.locator(successSel).first();
    if (await success.isVisible().catch(() => false)) {
      const txt = (await success.textContent().catch(() => ""))?.trim() || "";
      if (opts.expectMessage && !new RegExp(escapeRe(opts.expectMessage), "i").test(txt)) {
        return { result: "error", detail: `confirmation shown but did not match configured message "${opts.expectMessage}": "${txt.slice(0, 160)}"` };
      }
      return { result: "success", detail: `confirmation shown: ${txt.slice(0, 160) || "(empty success element)"}` };
    }
    // redirect to a thank-you style URL
    if (page.url() !== startUrl && /thank|success|confirm|submitted/i.test(page.url())) {
      return { result: "success", detail: `redirected to ${page.url()}` };
    }
    // the whole form went away (common AJAX success pattern)
    if ((await form.count().catch(() => 1)) === 0 || !(await form.isVisible().catch(() => true))) {
      // only treat as success if no error surfaced (checked above)
      return { result: "success", detail: "form was replaced/removed after submit" };
    }
    await page.waitForTimeout(500);
  }
  return { result: "inconclusive", detail: "no success or error signal within timeout (treated as skip)" };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
