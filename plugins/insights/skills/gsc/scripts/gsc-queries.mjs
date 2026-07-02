#!/usr/bin/env node
/**
 * gsc-queries.mjs — pulls Google Search Console performance data.
 *
 * Flow:
 *   1. Read GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN from the
 *      1Password item `GOOGLE SERVICES TOKEN` (vault `Env Variables & Secrets`).
 *   2. Read gsc.siteUrl from the nearest .refact-os.json (walks up from cwd).
 *   3. Exchange refresh token for a short-lived access token.
 *   4. Call GSC Search Analytics API.
 *   5. Print result as JSON on stdout.
 *
 * Flags:
 *   --dimension=...   One or more dimensions, comma-separated. Friendly names
 *                     (queries, pages, devices, countries, dates) or raw GSC
 *                     names (query, page, device, country, date). Combine for
 *                     cross-tabs, e.g. --dimension=query,page (cannibalization).
 *   --days=N          Trailing window length in days (default 28). Ignored if
 *                     --start/--end are given.
 *   --start=YYYY-MM-DD --end=YYYY-MM-DD   Explicit date range (both required
 *                     together). Overrides --days.
 *   --limit=N         Max rows per request (default 100, API hard cap 25000).
 *   --all             Paginate past 25000 and return every row (ignores --limit).
 *   --compare         Also pull the immediately-preceding window of equal length
 *                     and return per-row deltas + a new/lost/both status.
 *   --type=...        Search type: web (default) | image | video | news | discover.
 *   --brand=...       Regex (case-insensitive) marking branded queries; adds a
 *                     `branded` flag per query row and a brandedSummary total.
 *   --format=...      Output format: json (default) | csv.
 *   --out=PATH        Write output to PATH instead of stdout.
 *   --page=...        Filter: page URL CONTAINS this substring (e.g. /blog/).
 *   --query=...       Filter: query CONTAINS this substring (e.g. pricing).
 *   --country=...     Filter: country EQUALS this 3-letter code (e.g. usa).
 *   --device=...      Filter: device EQUALS desktop | mobile | tablet.
 *
 * Examples:
 *   node gsc-queries.mjs                                   # top queries, last 28 days
 *   node gsc-queries.mjs --dimension=pages                 # top landing pages
 *   node gsc-queries.mjs --dimension=query,page            # query × page (cannibalization)
 *   node gsc-queries.mjs --days=90 --limit=200             # 90-day window, 200 rows
 *   node gsc-queries.mjs --start=2026-03-01 --end=2026-03-31   # explicit range
 *   node gsc-queries.mjs --compare                         # last 28d vs prior 28d, with deltas
 *   node gsc-queries.mjs --page=/blog/ --query=seo         # filtered pull
 *   node gsc-queries.mjs --type=discover                   # Discover surface
 *   node gsc-queries.mjs --all --format=csv --out=q.csv    # every row, written as CSV
 *   node gsc-queries.mjs --brand='refact|refact\.co'       # branded vs non-branded
 *
 * Output shape (single dimension):
 *   {
 *     "site": "https://example.com/",
 *     "dimensions": ["query"],
 *     "startDate": "2026-05-13", "endDate": "2026-06-08",
 *     "filters": [...],
 *     "rowCount": 100,
 *     "rows": [ { "key": "example brand name",
 *                 "clicks": 1234, "impressions": 5678, "ctr": 0.217, "position": 1.4 }, ... ]
 *   }
 *
 * Output shape with --compare adds a comparison period and, per row:
 *   "previous": { clicks, impressions, ctr, position } | null,
 *   "delta":    { clicks, impressions, ctr, position },   // current - previous
 *   "status":   "new" | "lost" | "both"
 *   (position/ctr deltas are null when one side is missing; clicks/impressions
 *    treat a missing side as 0. A negative position delta means the rank improved.)
 */

import fs from 'node:fs';
import { getAccessToken, readSiteUrl, isoDate, addDays } from './_shared.mjs';

// Friendly dimension aliases → GSC's raw dimension names.
const DIM_ALIASES = {
  queries: 'query', query: 'query',
  pages: 'page', page: 'page',
  devices: 'device', device: 'device',
  countries: 'country', country: 'country',
  dates: 'date', date: 'date',
};
const VALID_TYPES = ['web', 'image', 'video', 'news', 'discover'];
const VALID_FORMATS = ['json', 'csv'];
const PAGE_SIZE = 25000; // GSC API hard cap per request.

// -- CLI parsing -------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    dimension: 'queries', days: 28, limit: 100, all: false,
    start: null, end: null, compare: false,
    type: 'web', brand: null, format: 'json', out: null,
    filters: { page: null, query: null, country: null, device: null },
  };
  for (const a of argv.slice(2)) {
    if (a === '--compare') { args.compare = true; continue; }
    if (a === '--all') { args.all = true; continue; }
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key === 'dimension') args.dimension = val;
    else if (key === 'days') args.days = parseInt(val, 10);
    else if (key === 'limit') args.limit = parseInt(val, 10);
    else if (key === 'start') args.start = val;
    else if (key === 'end') args.end = val;
    else if (key === 'type') args.type = val.toLowerCase();
    else if (key === 'brand') args.brand = val;
    else if (key === 'format') args.format = val.toLowerCase();
    else if (key === 'out') args.out = val;
    else if (['page', 'query', 'country', 'device'].includes(key)) args.filters[key] = val;
  }

  if (!Number.isInteger(args.days) || args.days < 1) {
    throw new Error(`--days must be a positive integer (got "${args.days}").`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) {
    throw new Error(`--limit must be a positive integer (got "${args.limit}").`);
  }

  // Resolve + validate dimensions (comma-separated, friendly or raw).
  args.dimensions = args.dimension.split(',').map((d) => {
    const raw = DIM_ALIASES[d.trim().toLowerCase()];
    if (!raw) {
      throw new Error(
        `Invalid dimension "${d.trim()}". Use one or more of: ` +
        `queries, pages, devices, countries, dates (comma-separated).`
      );
    }
    return raw;
  });

  // Validate explicit date range (both or neither).
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if ((args.start && !args.end) || (!args.start && args.end)) {
    throw new Error('--start and --end must be provided together.');
  }
  if (args.start && (!dateRe.test(args.start) || !dateRe.test(args.end))) {
    throw new Error('--start and --end must be YYYY-MM-DD.');
  }
  if (args.start && args.start > args.end) {
    throw new Error(`--start (${args.start}) is after --end (${args.end}).`);
  }

  if (!VALID_TYPES.includes(args.type)) {
    throw new Error(`Invalid --type "${args.type}". Use one of: ${VALID_TYPES.join(', ')}.`);
  }
  // Discover and News have no search queries, so the API only accepts
  // date/country/page dimensions for them.
  if (['discover', 'news'].includes(args.type)) {
    const allowed = ['date', 'country', 'page'];
    const bad = args.dimensions.filter((d) => !allowed.includes(d));
    if (bad.length > 0) {
      throw new Error(
        `--type=${args.type} only supports these dimensions: ${allowed.join(', ')}. ` +
        `Drop ${bad.join(', ')} (e.g. use --dimension=pages).`
      );
    }
  }
  if (!VALID_FORMATS.includes(args.format)) {
    throw new Error(`Invalid --format "${args.format}". Use one of: ${VALID_FORMATS.join(', ')}.`);
  }
  // Comparing two windows joins rows on their dimension keys; a date key is
  // unique to its window, so every row would come back "new" or "lost".
  if (args.compare && args.dimensions.includes('date')) {
    throw new Error(
      '--compare cannot be combined with the dates dimension (date rows never match ' +
      'across windows). Drop dates, or pull the two ranges separately with --start/--end.'
    );
  }
  if (args.brand) {
    try {
      args.brandRe = new RegExp(args.brand, 'i');
    } catch (e) {
      throw new Error(`Invalid --brand regex "${args.brand}": ${e.message}`);
    }
    if (!args.dimensions.includes('query')) {
      throw new Error('--brand needs a query dimension. Add query to --dimension (e.g. --dimension=queries).');
    }
  }
  return args;
}

// -- helpers -----------------------------------------------------------------

function daysBetweenInclusive(startIso, endIso) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.round(ms / 86400000) + 1;
}

// Build GSC dimensionFilterGroups from the simple --page/--query/--country/--device flags.
// page/query use CONTAINS (substring); country/device use EQUALS.
function buildFilters(filters) {
  const out = [];
  if (filters.page)    out.push({ dimension: 'page',    operator: 'contains', expression: filters.page });
  if (filters.query)   out.push({ dimension: 'query',   operator: 'contains', expression: filters.query });
  if (filters.country) out.push({ dimension: 'country', operator: 'equals',   expression: filters.country.toLowerCase() });
  if (filters.device)  out.push({ dimension: 'device',  operator: 'equals',   expression: filters.device.toUpperCase() });
  return out;
}

// -- GSC API call ------------------------------------------------------------

async function fetchPage({ accessToken, siteUrl, dimensions, startDate, endDate, rowLimit, startRow, filterExpr, type }) {
  const apiUrl =
    `https://searchconsole.googleapis.com/webmasters/v3/sites/` +
    `${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const body = { startDate, endDate, dimensions, rowLimit, startRow, type };
  if (filterExpr.length > 0) {
    body.dimensionFilterGroups = [{ groupType: 'and', filters: filterExpr }];
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC API call failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  // GSC returns { rows: [{ keys: ["foo", "bar"], clicks, impressions, ctr, position }] }.
  return (json.rows || []).map((r) => ({
    keys: r.keys || [],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

// Fetch one date window. With `all`, page through in 25000-row chunks until the
// API returns a short page; otherwise a single request capped at `limit`.
async function fetchGsc({ startDate, endDate, all, limit, ...common }) {
  if (!all) {
    return fetchPage({ ...common, startDate, endDate, rowLimit: Math.min(limit, PAGE_SIZE), startRow: 0 });
  }
  const rows = [];
  for (let startRow = 0; ; startRow += PAGE_SIZE) {
    const page = await fetchPage({ ...common, startDate, endDate, rowLimit: PAGE_SIZE, startRow });
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

// Shape one row's identity for output: a flat `key` for single dimension, or a
// `keys` object (dimension name → value) for multi-dimension pulls.
function identityOf(row, dimensions) {
  if (dimensions.length === 1) return { key: row.keys[0] ?? null };
  const keys = {};
  dimensions.forEach((d, i) => { keys[d] = row.keys[i] ?? null; });
  return { keys };
}

function metricsOf(row) {
  return { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
}

// Join current + previous rows on their composite key for --compare.
function buildComparison(current, previous, dimensions) {
  const joinKey = (row) => row.keys.join('\u0000');
  const prevMap = new Map(previous.map((r) => [joinKey(r), r]));
  const seen = new Set();
  const out = [];

  for (const cur of current) {
    const k = joinKey(cur);
    seen.add(k);
    const prev = prevMap.get(k);
    out.push(comparedRow(cur, prev, dimensions, 'cur'));
  }
  // Rows present only in the previous period = lost.
  for (const prev of previous) {
    const k = joinKey(prev);
    if (seen.has(k)) continue;
    out.push(comparedRow(null, prev, dimensions, 'prev'));
  }

  // Sort by absolute clicks delta desc so the biggest movers surface first.
  out.sort((a, b) => Math.abs(b.delta.clicks) - Math.abs(a.delta.clicks));
  return out;
}

function comparedRow(cur, prev, dimensions, idSource) {
  const idRow = idSource === 'cur' ? cur : prev;
  const c = cur ? metricsOf(cur) : null;
  const p = prev ? metricsOf(prev) : null;
  const status = c && p ? 'both' : c ? 'new' : 'lost';
  const curClicks = c ? c.clicks : 0;
  const curImpr   = c ? c.impressions : 0;
  const prevClicks = p ? p.clicks : 0;
  const prevImpr   = p ? p.impressions : 0;
  return {
    ...identityOf(idRow, dimensions),
    clicks: curClicks,
    impressions: curImpr,
    ctr: c ? c.ctr : 0,
    position: c ? c.position : null,
    previous: p,
    delta: {
      clicks: curClicks - prevClicks,
      impressions: curImpr - prevImpr,
      ctr: c && p ? c.ctr - p.ctr : null,
      position: c && p ? c.position - p.position : null,
    },
    status,
  };
}

// -- main --------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const siteUrl = readSiteUrl();
  const accessToken = await getAccessToken();

  // Resolve the primary window: explicit --start/--end, else trailing --days
  // ending at today-2 (GSC data has a ~2-day lag).
  let startDate, endDate;
  if (args.start) {
    startDate = args.start;
    endDate = args.end;
  } else {
    const end = addDays(new Date(), -2);
    const start = addDays(end, -(args.days - 1));
    startDate = isoDate(start);
    endDate = isoDate(end);
  }

  const filterExpr = buildFilters(args.filters);
  const common = {
    accessToken, siteUrl, dimensions: args.dimensions, filterExpr,
    type: args.type, all: args.all, limit: args.limit,
  };

  const currentRows = await fetchGsc({ ...common, startDate, endDate });

  const output = {
    site: siteUrl,
    dimensions: args.dimensions,
    type: args.type,
    startDate,
    endDate,
    filters: filterExpr,
  };

  if (args.compare) {
    // Previous window of equal length, ending the day before the primary window.
    const len = daysBetweenInclusive(startDate, endDate);
    const prevEnd = isoDate(addDays(new Date(startDate), -1));
    const prevStart = isoDate(addDays(new Date(prevEnd), -(len - 1)));
    const previousRows = await fetchGsc({ ...common, startDate: prevStart, endDate: prevEnd });

    output.compare = { startDate: prevStart, endDate: prevEnd };
    output.rows = buildComparison(currentRows, previousRows, args.dimensions);
  } else {
    output.rows = currentRows.map((r) => ({ ...identityOf(r, args.dimensions), ...metricsOf(r) }));
  }

  // Branded vs non-branded tagging (query dimension only).
  if (args.brandRe) {
    const summary = { branded: { clicks: 0, impressions: 0, rows: 0 },
                      nonBranded: { clicks: 0, impressions: 0, rows: 0 } };
    for (const row of output.rows) {
      const q = args.dimensions.length === 1 ? row.key : row.keys?.query;
      const branded = q != null && args.brandRe.test(q);
      row.branded = branded;
      const bucket = branded ? summary.branded : summary.nonBranded;
      bucket.clicks += row.clicks || 0;
      bucket.impressions += row.impressions || 0;
      bucket.rows += 1;
    }
    output.brandedSummary = summary;
  }

  output.rowCount = output.rows.length;

  const content = args.format === 'csv' ? toCsv(output) : JSON.stringify(output, null, 2);
  if (args.out) {
    fs.writeFileSync(args.out, content, 'utf8');
    console.error(`Wrote ${output.rowCount} row(s) to ${args.out}`);
  } else {
    console.log(content);
  }
}

// -- CSV ---------------------------------------------------------------------

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(output) {
  const dims = output.dimensions;
  const compare = Boolean(output.compare);
  const branded = output.rows.some((r) => 'branded' in r);

  const header = [...dims, 'clicks', 'impressions', 'ctr', 'position'];
  if (compare) header.push('prev_clicks', 'prev_impressions', 'prev_ctr', 'prev_position',
                           'delta_clicks', 'delta_impressions', 'delta_ctr', 'delta_position', 'status');
  if (branded) header.push('branded');

  const lines = [header.map(csvCell).join(',')];
  for (const r of output.rows) {
    const dimVals = dims.length === 1 ? [r.key] : dims.map((d) => r.keys?.[d]);
    const cells = [...dimVals, r.clicks, r.impressions, r.ctr, r.position];
    if (compare) {
      const p = r.previous;
      cells.push(p?.clicks, p?.impressions, p?.ctr, p?.position,
                 r.delta.clicks, r.delta.impressions, r.delta.ctr, r.delta.position, r.status);
    }
    if (branded) cells.push(r.branded);
    lines.push(cells.map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
