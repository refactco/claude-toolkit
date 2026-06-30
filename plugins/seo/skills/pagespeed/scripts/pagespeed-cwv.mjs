#!/usr/bin/env node
/**
 * pagespeed-cwv.mjs — real-user Core Web Vitals from the Chrome UX Report (CrUX).
 *
 * This is field data (real Chrome users over the trailing 28 days) — the same
 * source behind Search Console's Core Web Vitals report. Read-only.
 *
 * Auth: GOOGLE_API_KEY from 1Password (see _shared.mjs / the SKILL). Target is
 * derived from gsc.siteUrl in .refact-os.json unless --url/--origin is given.
 *
 * Flags:
 *   --origin=URL       Origin-level data (default; e.g. https://example.com).
 *   --url=URL          URL-level data for one specific page.
 *   --form-factor=F    PHONE | DESKTOP | TABLET (default: all form factors combined).
 *   --history          Return the weekly p75 timeseries (~25 collection periods)
 *                      instead of the latest single snapshot.
 *
 * Examples:
 *   node pagespeed-cwv.mjs                                   # origin from config
 *   node pagespeed-cwv.mjs --url=https://example.com/pricing
 *   node pagespeed-cwv.mjs --form-factor=PHONE --history
 *
 * Note: CrUX only has data for origins/URLs with enough Chrome traffic. Low-traffic
 * sites or pages return 404 (CrUX_DATA_NOT_FOUND) — that's expected, not an error
 * in the setup. INP in particular often lacks data on smaller sites.
 */

import { readApiKey, resolveSite, THRESHOLDS, verdictFor } from './_shared.mjs';

const BASE = 'https://chromeuxreport.googleapis.com/v1';

function parseArgs(argv) {
  const args = { origin: null, url: null, formFactor: null, history: false };
  for (const a of argv.slice(2)) {
    if (a === '--history') { args.history = true; continue; }
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (!m) continue;
    if (m[1] === 'origin') args.origin = m[2];
    else if (m[1] === 'url') args.url = m[2];
    else if (m[1] === 'form-factor') args.formFactor = m[2].toUpperCase();
  }
  if (args.formFactor && !['PHONE', 'DESKTOP', 'TABLET'].includes(args.formFactor)) {
    throw new Error(`Invalid --form-factor "${args.formFactor}". Use PHONE, DESKTOP, or TABLET.`);
  }
  return args;
}

function resolveTarget(args) {
  if (args.url) return { kind: 'url', value: args.url };
  if (args.origin) return { kind: 'origin', value: args.origin };
  const site = resolveSite();
  if (!site) {
    throw new Error(
      'No target. Pass --origin=<URL> or --url=<URL>, or set gsc.siteUrl in .refact-os.json.'
    );
  }
  return { kind: 'origin', value: site.origin };
}

async function call(endpoint, apiKey, body) {
  const res = await fetch(`${BASE}/${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg = json?.error?.message || text.slice(0, 200);
    const code = json?.error?.code ?? res.status;
    if (code === 404) {
      const e = new Error('CrUX has no data for this origin/URL (not enough Chrome traffic).');
      e.notFound = true;
      throw e;
    }
    throw new Error(`CrUX ${endpoint} failed (${res.status}): ${msg}`);
  }
  return json;
}

// Latest single snapshot.
async function snapshot(apiKey, target, formFactor) {
  const body = { [target.kind]: target.value };
  if (formFactor) body.formFactor = formFactor;
  const json = await call('records:queryRecord', apiKey, body);
  const rec = json.record;
  const metrics = {};
  for (const [key, def] of Object.entries(THRESHOLDS)) {
    const m = rec.metrics[key];
    if (!m) continue;
    const p75 = m.percentiles?.p75;
    const bins = m.histogram || [];
    metrics[def.label] = {
      key,
      p75: p75 == null ? null : Number(p75),
      unit: def.unit,
      isCore: def.core,
      verdict: verdictFor(key, p75),
      distribution: {
        good: bins[0]?.density ?? null,
        needsImprovement: bins[1]?.density ?? null,
        poor: bins[2]?.density ?? null,
      },
    };
  }
  return { collectionPeriod: rec.collectionPeriod ?? null, metrics };
}

// Weekly p75 timeseries (queryHistoryRecord).
async function history(apiKey, target, formFactor) {
  const body = { [target.kind]: target.value };
  if (formFactor) body.formFactor = formFactor;
  const json = await call('records:queryHistoryRecord', apiKey, body);
  const rec = json.record;
  // Each period's lastDate {year,month,day} → "YYYY-MM-DD" for readability.
  const periods = (rec.collectionPeriods || []).map((p) => {
    const d = p.lastDate || {};
    return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  });
  const series = {};
  for (const [key, def] of Object.entries(THRESHOLDS)) {
    const m = rec.metrics[key];
    if (!m) continue;
    const p75s = (m.percentilesTimeseries?.p75s || []).map((v) => (v == null ? null : Number(v)));
    series[def.label] = {
      key,
      unit: def.unit,
      isCore: def.core,
      p75Timeseries: p75s,
      latest: p75s.length ? p75s[p75s.length - 1] : null,
      latestVerdict: p75s.length ? verdictFor(key, p75s[p75s.length - 1]) : null,
    };
  }
  return { collectionPeriods: periods, metrics: series };
}

// Overall CWV pass/fail: all three core metrics that have data must be GOOD.
function coreAssessment(metricsByLabel) {
  const core = ['LCP', 'INP', 'CLS'].map((l) => metricsByLabel[l]).filter(Boolean);
  if (core.length === 0) return 'INSUFFICIENT_DATA';
  if (core.some((m) => (m.verdict ?? m.latestVerdict) == null)) return 'INSUFFICIENT_DATA';
  return core.every((m) => (m.verdict ?? m.latestVerdict) === 'GOOD') ? 'PASS' : 'FAIL';
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = readApiKey();
  const target = resolveTarget(args);

  try {
    const data = args.history
      ? await history(apiKey, target, args.formFactor)
      : await snapshot(apiKey, target, args.formFactor);

    const output = {
      source: 'CrUX (field / real-user data, trailing 28 days)',
      target,
      formFactor: args.formFactor || 'ALL',
      mode: args.history ? 'history' : 'snapshot',
      coreWebVitalsAssessment: coreAssessment(data.metrics),
      // Core metrics CrUX has no data for here (small sites often lack INP).
      missingCoreMetrics: ['LCP', 'INP', 'CLS'].filter((l) => !(l in data.metrics)),
      ...data,
    };
    console.log(JSON.stringify(output, null, 2));
  } catch (e) {
    if (e.notFound) {
      console.log(JSON.stringify({
        source: 'CrUX (field / real-user data)',
        target,
        formFactor: args.formFactor || 'ALL',
        mode: args.history ? 'history' : 'snapshot',
        coreWebVitalsAssessment: 'NO_DATA',
        note: e.message,
      }, null, 2));
      return;
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
