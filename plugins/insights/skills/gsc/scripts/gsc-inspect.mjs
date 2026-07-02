#!/usr/bin/env node
/**
 * gsc-inspect.mjs — Google Search Console URL Inspection API.
 *
 * Returns Google's index status for one or more URLs: coverage verdict, the
 * canonical Google chose vs. the one you declared, last crawl time, crawl/fetch
 * state, robots.txt state, sitemap/referring URLs, plus mobile-usability and
 * rich-results verdicts. Read-only.
 *
 * Reads the property from gsc.siteUrl in .refact-os.json and creds from 1Password
 * (see the connect reference / _shared.mjs). The inspected URL must belong to
 * that property.
 *
 * Flags:
 *   --url=URL          Inspect a single URL.
 *   --urls-file=PATH   Inspect every URL in a file (one per line, # comments ok).
 *   --lang=CODE        BCP-47 language for messages (default en-US).
 *
 * Examples:
 *   node gsc-inspect.mjs --url=https://example.com/pricing
 *   node gsc-inspect.mjs --urls-file=urls.txt
 *
 * Quota: the API allows ~2000 inspections/day and 600/min per property, so this
 * paces batch requests. Feed it a focused list (e.g. pages flagged by a report),
 * not a whole-site crawl.
 */

import fs from 'node:fs';
import { getAccessToken, readSiteUrl } from './_shared.mjs';

const ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const PACE_MS = 150; // ~400/min, comfortably under the 600/min cap.

function parseArgs(argv) {
  const args = { url: null, urlsFile: null, lang: 'en-US' };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (!m) continue;
    if (m[1] === 'url') args.url = m[2];
    else if (m[1] === 'urls-file') args.urlsFile = m[2];
    else if (m[1] === 'lang') args.lang = m[2];
  }
  if (!args.url && !args.urlsFile) {
    throw new Error('Provide --url=<URL> or --urls-file=<path>.');
  }
  return args;
}

function loadUrls(args) {
  if (args.url) return [args.url];
  let raw;
  try {
    raw = fs.readFileSync(args.urlsFile, 'utf8');
  } catch (e) {
    throw new Error(`Could not read --urls-file "${args.urlsFile}": ${e.message}`);
  }
  const urls = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (urls.length === 0) {
    throw new Error(`--urls-file "${args.urlsFile}" contains no URLs.`);
  }
  if (urls.length > 2000) {
    throw new Error(
      `--urls-file has ${urls.length} URLs, but the API quota is ~2000 inspections/day ` +
      `per property. Split the list and spread it across days.`
    );
  }
  return urls;
}

async function inspect(accessToken, siteUrl, inspectionUrl, lang) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: lang }),
  });
  if (!res.ok) {
    return { url: inspectionUrl, error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const json = await res.json();
  const r = json.inspectionResult || {};
  const idx = r.indexStatusResult || {};
  return {
    url: inspectionUrl,
    verdict: idx.verdict ?? null,                  // PASS | NEUTRAL | FAIL | ...
    coverageState: idx.coverageState ?? null,      // e.g. "Submitted and indexed"
    robotsTxtState: idx.robotsTxtState ?? null,
    indexingState: idx.indexingState ?? null,
    pageFetchState: idx.pageFetchState ?? null,
    lastCrawlTime: idx.lastCrawlTime ?? null,
    crawledAs: idx.crawledAs ?? null,
    googleCanonical: idx.googleCanonical ?? null,
    userCanonical: idx.userCanonical ?? null,
    sitemaps: idx.sitemap ?? [],
    referringUrls: idx.referringUrls ?? [],
    mobileUsability: r.mobileUsabilityResult?.verdict ?? null,
    richResults: r.richResultsResult?.verdict ?? null,
    inspectionResultLink: r.inspectionResultLink ?? null,
  };
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  const args = parseArgs(process.argv);
  const siteUrl = readSiteUrl();
  const accessToken = await getAccessToken();
  const urls = loadUrls(args);

  const results = [];
  for (let i = 0; i < urls.length; i++) {
    results.push(await inspect(accessToken, siteUrl, urls[i], args.lang));
    if (i < urls.length - 1) await sleep(PACE_MS);
  }

  const output = {
    site: siteUrl,
    inspectedCount: results.length,
    results,
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
