#!/usr/bin/env node
/**
 * pagespeed-audit.mjs — on-demand Lighthouse audit via the PageSpeed Insights API.
 *
 * This is LAB data (a fresh Lighthouse run in a controlled environment) plus the
 * top opportunities to fix — works for any URL, even low-traffic pages CrUX can't
 * cover. For real-user Core Web Vitals use pagespeed-cwv.mjs instead. Read-only.
 *
 * Auth: GOOGLE_API_KEY from 1Password. Target URL is derived from gsc.siteUrl in
 * .refact-os.json (homepage) unless --url is given.
 *
 * Flags:
 *   --url=URL          Page to audit (default: site homepage from config).
 *   --strategy=S       mobile (default) | desktop.
 *   --categories=...   Comma-separated: performance (default), accessibility,
 *                      best-practices, seo. (pwa was removed in Lighthouse 12.)
 *   --top=N            Number of top opportunities to return (default 8).
 *
 * Examples:
 *   node pagespeed-audit.mjs
 *   node pagespeed-audit.mjs --url=https://example.com/pricing --strategy=desktop
 *   node pagespeed-audit.mjs --categories=performance,seo,accessibility
 *
 * Note: a Lighthouse run takes ~10–30s, so this is slower than the other scripts.
 */

import { readApiKey, resolveSite } from './_shared.mjs';

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
// 'pwa' is gone: Lighthouse 12+ removed the category and PSI silently ignores it
// (and then runs ALL categories), so rejecting it up front is kinder.
const VALID_CATS = ['performance', 'accessibility', 'best-practices', 'seo'];
// Key lab metric audits worth surfacing explicitly.
const METRIC_AUDITS = [
  'first-contentful-paint', 'largest-contentful-paint', 'cumulative-layout-shift',
  'total-blocking-time', 'speed-index', 'interactive',
];
// metricSavings keys measured in ms (CLS savings are unitless score points).
const MS_SAVINGS = ['LCP', 'FCP', 'TBT', 'INP'];
// Modes that mean "not scored / purely diagnostic" — never opportunities.
const SKIP_MODES = new Set(['informative', 'notApplicable', 'manual', 'error']);

function parseArgs(argv) {
  const args = { url: null, strategy: 'mobile', categories: ['performance'], top: 8 };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (!m) continue;
    if (m[1] === 'url') args.url = m[2];
    else if (m[1] === 'strategy') args.strategy = m[2].toLowerCase();
    else if (m[1] === 'top') args.top = parseInt(m[2], 10);
    else if (m[1] === 'categories') {
      args.categories = m[2].split(',').map((c) => c.trim().toLowerCase());
    }
  }
  if (!['mobile', 'desktop'].includes(args.strategy)) {
    throw new Error(`Invalid --strategy "${args.strategy}". Use mobile or desktop.`);
  }
  if (!Number.isInteger(args.top) || args.top < 1) {
    throw new Error(`--top must be a positive integer (got "${args.top}").`);
  }
  const bad = args.categories.filter((c) => !VALID_CATS.includes(c));
  if (bad.length) {
    throw new Error(
      `Invalid --categories: ${bad.join(', ')}. Valid: ${VALID_CATS.join(', ')}.` +
      (bad.includes('pwa') ? ' (The pwa category was removed in Lighthouse 12.)' : '')
    );
  }
  return args;
}

function resolveUrl(args) {
  if (args.url) return args.url;
  const site = resolveSite();
  if (!site) {
    throw new Error('No URL. Pass --url=<URL>, or set gsc.siteUrl in .refact-os.json.');
  }
  return site.url;
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = readApiKey();
  const url = resolveUrl(args);

  const qs = new URLSearchParams({ url, strategy: args.strategy, key: apiKey });
  for (const c of args.categories) qs.append('category', c);

  const res = await fetch(`${ENDPOINT}?${qs.toString()}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`PSI failed (${res.status}): ${json?.error?.message || JSON.stringify(json)}`);
  }

  const lh = json.lighthouseResult || {};
  const audits = lh.audits || {};

  // Category scores (0–1, or null if not requested/available).
  const scores = {};
  for (const [id, cat] of Object.entries(lh.categories || {})) {
    scores[id] = cat.score;
  }

  // Key lab metrics.
  const labMetrics = {};
  for (const id of METRIC_AUDITS) {
    const a = audits[id];
    if (a) labMetrics[id] = { value: a.numericValue ?? null, display: a.displayValue ?? null, score: a.score };
  }

  // Estimated ms saved for an audit. Lighthouse 12+ reports per-metric savings in
  // `metricSavings` (the old details.overallSavingsMs is mostly 0 now); take the
  // largest ms-based metric saving, falling back to overallSavingsMs.
  const savingsOf = (a) => {
    const fromMetrics = Math.max(0, ...MS_SAVINGS.map((m) => a.metricSavings?.[m] ?? 0));
    return Math.round(Math.max(fromMetrics, a.details?.overallSavingsMs ?? 0));
  };

  // Failing, scored, non-diagnostic audits.
  const failing = Object.values(audits).filter(
    (a) => a.score != null && a.score < 1 && !SKIP_MODES.has(a.scoreDisplayMode)
  );

  // Top opportunities: failing audits with estimated time savings, biggest first.
  const opportunities = failing
    .filter((a) => savingsOf(a) > 0)
    .map((a) => ({
      id: a.id,
      title: a.title,
      display: a.displayValue ?? null,
      estimatedSavingsMs: savingsOf(a),
      metricSavings: a.metricSavings ?? null,
      score: a.score,
    }))
    .sort((x, y) => y.estimatedSavingsMs - x.estimatedSavingsMs)
    .slice(0, args.top);

  // Other failing audits (no ms savings — e.g. CLS-only, caching, a11y/SEO checks).
  // Metric audits are excluded: labMetrics already reports them, and they're
  // scores to improve, not actions to take.
  const oppIds = new Set(opportunities.map((o) => o.id));
  const flagged = failing
    .filter((a) => !oppIds.has(a.id) && !METRIC_AUDITS.includes(a.id) && a.score < 0.9)
    .map((a) => ({ id: a.id, title: a.title, score: a.score }))
    .slice(0, args.top);

  // Field data PSI bundles from CrUX, if the URL has coverage.
  const fieldData = json.loadingExperience?.metrics
    ? { overallCategory: json.loadingExperience.overall_category ?? null,
        hasData: true }
    : { hasData: false };

  const output = {
    source: 'PageSpeed Insights / Lighthouse (lab data)',
    url,
    strategy: args.strategy,
    lighthouseVersion: lh.lighthouseVersion ?? null,
    fetchedAt: lh.fetchTime ?? null,
    scores,
    labMetrics,
    opportunities,
    flaggedAudits: flagged,
    fieldData,
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
