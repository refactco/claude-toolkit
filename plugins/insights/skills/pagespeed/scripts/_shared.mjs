// _shared.mjs — common helpers for the pagespeed scripts.
//
// The generic helpers (.refact-os.json lookup, 1Password coordinates) live in
// the pack-shared ../../../lib/common.mjs; this file re-exports them for the
// sibling scripts and keeps the pagespeed-specific pieces (API-key auth, site
// normalization, CWV thresholds/verdicts). Sibling scripts import from
// './_shared.mjs' only.
//
// Unlike the gsc skill (OAuth), CrUX and PageSpeed Insights authenticate with a
// simple API KEY: GOOGLE_API_KEY on the 1Password item `GOOGLE SERVICES TOKEN`
// (vault `Env Variables & Secrets`). The target site is derived from gsc.siteUrl
// in the nearest .refact-os.json (normalized to a plain origin/URL, since CrUX
// and PSI need real URLs, not the `sc-domain:` property form).

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { findRefactOsJson, OP_VAULT, OP_ITEM } from '../../../lib/common.mjs';

export { OP_VAULT, OP_ITEM, findRefactOsJson } from '../../../lib/common.mjs';

export function readApiKey() {
  let key;
  try {
    key = execSync(
      `op item get "${OP_ITEM}" --vault "${OP_VAULT}" --fields label=GOOGLE_API_KEY --reveal`,
      { encoding: 'utf8' },
    ).trim();
  } catch (e) {
    throw new Error(
      `Could not read GOOGLE_API_KEY from 1Password item "${OP_ITEM}" (vault "${OP_VAULT}").\n` +
      `Make sure the field exists and that 'op' is signed in.\n` +
      `Original error: ${e.message}`
    );
  }
  if (!key) {
    throw new Error(
      `GOOGLE_API_KEY is empty in 1Password. Create an API key in the Google Cloud ` +
      `project (APIs & Services → Credentials), restrict it to the PageSpeed Insights ` +
      `and Chrome UX Report APIs, then store it:\n` +
      `  op item edit "${OP_ITEM}" --vault "${OP_VAULT}" "GOOGLE_API_KEY[password]=AIza..."`
    );
  }
  return key;
}

// Normalize whatever is in gsc.siteUrl into { origin, url }:
//   sc-domain:example.com  -> origin https://example.com, url https://example.com/
//   https://example.com/   -> origin https://example.com, url https://example.com/
function normalize(siteUrl) {
  const s = String(siteUrl).trim();
  if (s.startsWith('sc-domain:')) {
    const domain = s.slice('sc-domain:'.length);
    return { origin: `https://${domain}`, url: `https://${domain}/` };
  }
  const u = new URL(s);
  return { origin: u.origin, url: s };
}

// Resolve the default target from .refact-os.json (gsc.siteUrl). Returns
// { origin, url } or null if no config is present — callers can still accept an
// explicit --url/--origin flag instead.
export function resolveSite() {
  const file = findRefactOsJson(process.cwd());
  if (!file) return null;
  try {
    const siteUrl = JSON.parse(fs.readFileSync(file, 'utf8'))?.gsc?.siteUrl;
    return siteUrl ? normalize(siteUrl) : null;
  } catch {
    return null;
  }
}

// Core Web Vitals p75 thresholds (Google's official good/poor boundaries).
export const THRESHOLDS = {
  largest_contentful_paint:       { label: 'LCP',  unit: 'ms', good: 2500, poor: 4000, core: true },
  interaction_to_next_paint:      { label: 'INP',  unit: 'ms', good: 200,  poor: 500,  core: true },
  cumulative_layout_shift:        { label: 'CLS',  unit: '',   good: 0.10, poor: 0.25, core: true },
  first_contentful_paint:         { label: 'FCP',  unit: 'ms', good: 1800, poor: 3000, core: false },
  experimental_time_to_first_byte:{ label: 'TTFB', unit: 'ms', good: 800,  poor: 1800, core: false },
};

export function verdictFor(metricKey, p75) {
  const t = THRESHOLDS[metricKey];
  if (!t || p75 == null) return null;
  const v = Number(p75);
  if (v <= t.good) return 'GOOD';
  if (v <= t.poor) return 'NEEDS_IMPROVEMENT';
  return 'POOR';
}
