import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { env, routes } from "./qaConfig";
import { nativeForms, readFormInfo, triggerLazyForms, type FormInfo } from "./lib/forms";

// HARD forms layer — runs on EVERY update (any plugin can break a form: a cache,
// SEO, or JS-optimizer plugin just as easily as the form plugin itself). It is
// generic across WPForms / Gravity / CF7 / Ninja / HubSpot / Mailchimp / plain
// <form> — no form id is hardcoded; it just sees what each page renders.
//
// Safe against false-rollback the same way the link checks are: it is
// BASELINE-DELTA. The baseline (forms-baseline.json, committed) records the
// forms each route had + each form's required-field signature. A run only FAILS
// (gates rollback) when an update makes a previously-present form — or a required
// field inside it — DISAPPEAR. A new form, or a site that simply has no forms,
// never fails. Regenerate the baseline with PLUGIN_UPDATE_FORMS_UPDATE=1.
//
// Real submission (SOFT, side-effecting) lives in forms-submit.spec.ts.
// Run:  npm run plugin-update:functional   (HARD bucket)

const BASELINE = path.join(__dirname, "forms-baseline.json");
const UPDATE = process.env.PLUGIN_UPDATE_FORMS_UPDATE === "1";

type RouteForms = Record<string, FormInfo[]>; // path -> forms
const baseline: RouteForms = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};
const collected: RouteForms = {};

test(`forms still render with their required fields [${env}]`, async ({ page }) => {
  const regressions: string[] = [];

  for (const r of routes) {
    await page.goto(r.path, { waitUntil: "domcontentloaded" }).catch(() => {});
    // nudge lazy/scroll-triggered embeds (Mailchimp, newsletter popups) to mount
    await triggerLazyForms(page);

    // Snapshot the form handles ONCE (a Locator re-evaluates nth(i) against the
    // live DOM each time — a form unmounting mid-loop would under-count and
    // FALSE-gate the rollback). .all() resolves to fixed element handles.
    const formEls = await nativeForms(page).all().catch(() => []);
    const infos: FormInfo[] = [];
    for (const fe of formEls) {
      const info = await readFormInfo(fe).catch(() => null);
      // ignore the bare 1-field header search box — it isn't a "form" we track
      if (info && (info.fieldCount >= 2 || info.plugin !== "generic")) infos.push(info);
    }
    collected[r.path] = infos;

    if (UPDATE) continue;

    // Delta: every form the baseline recorded for this path must still be here —
    // matched by form key (id/name) when available so multiple same-plugin forms
    // don't cross-match — and must not have LOST a required field. fieldCount > 0
    // rejects matching against a form that went fully hidden (CSS regression).
    for (const base of baseline[r.path] || []) {
      const match = infos.find(
        (cur) =>
          cur.plugin === base.plugin &&
          cur.fieldCount > 0 &&
          (base.formKey ? cur.formKey === base.formKey : true) &&
          base.requiredKeys.every((k) => cur.requiredKeys.includes(k)),
      );
      if (!match) {
        const samePlugin = infos.find((c) => c.plugin === base.plugin && (base.formKey ? c.formKey === base.formKey : true));
        regressions.push(
          samePlugin
            ? `${r.path}: ${base.plugin} form ${base.formKey ? `(${base.formKey}) ` : ""}lost required field(s) or went empty — had [${base.requiredKeys.join(", ")}], now fieldCount=${samePlugin.fieldCount} [${samePlugin.requiredKeys.join(", ")}]`
            : `${r.path}: ${base.plugin} form ${base.formKey ? `(${base.formKey}) ` : ""}(was present) no longer renders`,
        );
      }
    }
  }

  test.skip(UPDATE, "updating forms baseline (PLUGIN_UPDATE_FORMS_UPDATE=1)");
  expect(
    regressions,
    `Form regression(s) newly introduced by this update (gates auto-rollback):\n${regressions.join("\n")}`,
  ).toHaveLength(0);
});

test.afterAll(() => {
  if (UPDATE) {
    fs.writeFileSync(BASELINE, JSON.stringify(collected, null, 2) + "\n");
    // eslint-disable-next-line no-console
    console.log(`forms baseline written: ${BASELINE}`);
  }
});
