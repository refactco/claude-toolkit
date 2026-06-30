#!/usr/bin/env node
/**
 * ga4-report.mjs — pull a Google Analytics 4 report via the Data API (runReport).
 *
 * Flow:
 *   1. Read creds from the 1Password item `GOOGLE SERVICES TOKEN`.
 *   2. Read ga4.propertyId from the nearest .refact-os.json (walks up from cwd).
 *   3. Exchange refresh token for a short-lived access token.
 *   4. Call the GA4 Data API runReport endpoint.
 *   5. Print result as JSON (or CSV) on stdout.
 *
 * Flags:
 *   --metrics=...     Comma-separated metrics. Friendly aliases (users, sessions,
 *                     pageviews, newUsers, engagementRate, avgSessionDuration,
 *                     bounceRate, conversions, events, revenue) or raw GA4 API
 *                     names. Default: sessions,totalUsers,screenPageViews.
 *   --dimensions=...  Comma-separated dimensions. Friendly aliases (date, country,
 *                     city, device, browser, page, pageTitle, landingPage,
 *                     channel, source, medium, sourceMedium, eventName) or raw
 *                     GA4 API names. Default: date.
 *   --days=N          Trailing window length in days (default 28). Window ends
 *                     yesterday (avoids partial same-day data). Ignored if
 *                     --start/--end are given.
 *   --start=YYYY-MM-DD --end=YYYY-MM-DD   Explicit date range (both required together).
 *   --limit=N         Max rows (default 100, API hard cap 250000).
 *   --order=NAME[:asc|:desc]   Sort by a metric or dimension. Default: first
 *                     metric, descending.
 *   --filter=EXPR     Dimension filter(s), comma-separated (AND). Each EXPR is
 *                     name==value (exact), name=@value (contains), or
 *                     name=~value (regex). Names accept the same aliases.
 *   --compare         Also pull the immediately-preceding window of equal length
 *                     and return per-row deltas + a new/lost/both status.
 *   --format=...      json (default) | csv.
 *   --out=PATH        Write to PATH instead of stdout.
 *
 * Examples:
 *   node ga4-report.mjs                                         # daily sessions/users/views, 28d
 *   node ga4-report.mjs --dimensions=channel --metrics=sessions,conversions
 *   node ga4-report.mjs --dimensions=page --metrics=screenPageViews --limit=20
 *   node ga4-report.mjs --dimensions=country --days=90 --order=totalUsers:desc
 *   node ga4-report.mjs --dimensions=page --filter=page=@/blog/ --compare
 *   node ga4-report.mjs --dimensions=sourceMedium --format=csv --out=acq.csv
 */

import fs from 'node:fs';
import { getAccessToken, readPropertyId, isoDate, addDays } from './_shared.mjs';

const METRIC_ALIASES = {
  users: 'totalUsers', totalusers: 'totalUsers', activeusers: 'activeUsers',
  newusers: 'newUsers', sessions: 'sessions', engagedsessions: 'engagedSessions',
  pageviews: 'screenPageViews', views: 'screenPageViews', screenpageviews: 'screenPageViews',
  engagementrate: 'engagementRate', avgsessionduration: 'averageSessionDuration',
  averagesessionduration: 'averageSessionDuration', bouncerate: 'bounceRate',
  conversions: 'conversions', keyevents: 'keyEvents', events: 'eventCount',
  eventcount: 'eventCount', revenue: 'totalRevenue', totalrevenue: 'totalRevenue',
};
const DIMENSION_ALIASES = {
  date: 'date', country: 'country', city: 'city', region: 'region',
  device: 'deviceCategory', devicecategory: 'deviceCategory', browser: 'browser',
  os: 'operatingSystem', page: 'pagePath', pagepath: 'pagePath',
  pagetitle: 'pageTitle', landingpage: 'landingPage',
  channel: 'sessionDefaultChannelGroup', source: 'sessionSource',
  medium: 'sessionMedium', sourcemedium: 'sessionSourceMedium',
  campaign: 'sessionCampaignName', eventname: 'eventName',
};
const VALID_FORMATS = ['json', 'csv'];
const API_MAX = 250000;

function resolveName(token, aliases) {
  const key = token.trim();
  return aliases[key.toLowerCase()] || key; // unknown → pass through as a raw GA4 name
}

function parseArgs(argv) {
  const args = {
    metrics: 'sessions,totalUsers,screenPageViews', dimensions: 'date',
    days: 28, limit: 100, start: null, end: null, order: null,
    filter: null, compare: false, format: 'json', out: null,
  };
  for (const a of argv.slice(2)) {
    if (a === '--compare') { args.compare = true; continue; }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key in args) args[key] = val;
  }

  args.metricNames = args.metrics.split(',').filter(Boolean).map((m) => resolveName(m, METRIC_ALIASES));
  args.dimensionNames = args.dimensions.split(',').filter((d) => d.trim().length).map((d) => resolveName(d, DIMENSION_ALIASES));
  if (args.metricNames.length === 0) throw new Error('--metrics needs at least one metric.');

  args.limit = parseInt(args.limit, 10);
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error('--limit must be a positive integer.');
  if (args.limit > API_MAX) args.limit = API_MAX;

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

  if (!VALID_FORMATS.includes(args.format)) {
    throw new Error(`Invalid --format "${args.format}". Use json or csv.`);
  }
  if (args.compare && args.dimensionNames.includes('date')) {
    throw new Error('--compare cannot be combined with the date dimension (date rows never match across windows).');
  }
  return args;
}

// name[:asc|:desc] → a GA4 orderBys entry. Defaults to the first metric desc.
function buildOrderBys(orderArg, metricNames, dimensionNames) {
  if (!orderArg) return [{ metric: { metricName: metricNames[0] }, desc: true }];
  const [rawName, dir] = orderArg.split(':');
  const name = resolveName(rawName, { ...METRIC_ALIASES, ...DIMENSION_ALIASES });
  const desc = (dir || 'desc').toLowerCase() !== 'asc';
  if (metricNames.includes(name)) return [{ metric: { metricName: name }, desc }];
  return [{ dimension: { dimensionName: name }, desc }];
}

// EXPR list (comma-separated) → a GA4 dimensionFilter andGroup, or null.
function buildDimensionFilter(filterArg) {
  if (!filterArg) return null;
  const exprs = filterArg.split(',').map((e) => e.trim()).filter(Boolean).map((e) => {
    let m;
    if ((m = e.match(/^(.+?)==(.*)$/)))  return mkFilter(m[1], 'EXACT', m[2]);
    if ((m = e.match(/^(.+?)=@(.*)$/)))  return mkFilter(m[1], 'CONTAINS', m[2]);
    if ((m = e.match(/^(.+?)=~(.*)$/)))  return mkFilter(m[1], 'PARTIAL_REGEXP', m[2]);
    throw new Error(`Bad --filter "${e}". Use name==value, name=@value, or name=~regex.`);
  });
  return { andGroup: { expressions: exprs } };
}
function mkFilter(name, matchType, value) {
  return {
    filter: {
      fieldName: resolveName(name, DIMENSION_ALIASES),
      stringFilter: { matchType, value, caseSensitive: false },
    },
  };
}

async function runReport({ accessToken, propertyId, body }) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 Data API runReport failed (${res.status}): ${text}`);
  }
  return res.json();
}

// GA4 returns every value as a string; coerce metrics to numbers using their header type.
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : v; }

function shapeRows(report, dimensionNames, metricNames) {
  return (report.rows || []).map((r) => {
    const dims = {};
    dimensionNames.forEach((d, i) => { dims[d] = r.dimensionValues?.[i]?.value ?? null; });
    const metrics = {};
    metricNames.forEach((m, i) => { metrics[m] = num(r.metricValues?.[i]?.value); });
    return { dims, metrics };
  });
}

function identity(dimensionNames, dims) {
  if (dimensionNames.length === 0) return { key: 'total' };
  if (dimensionNames.length === 1) return { key: dims[dimensionNames[0]] };
  return { keys: dims };
}

function joinKey(dimensionNames, dims) {
  return dimensionNames.map((d) => dims[d] ?? '').join(' ');
}

async function main() {
  const args = parseArgs(process.argv);
  const propertyId = readPropertyId();
  const accessToken = await getAccessToken();

  let startDate, endDate;
  if (args.start) {
    startDate = args.start; endDate = args.end;
  } else {
    const end = addDays(new Date(), -1); // yesterday — avoids partial same-day data
    const start = addDays(end, -(args.days - 1));
    startDate = isoDate(start); endDate = isoDate(end);
  }

  const baseBody = {
    dimensions: args.dimensionNames.map((name) => ({ name })),
    metrics: args.metricNames.map((name) => ({ name })),
    limit: args.limit,
    orderBys: buildOrderBys(args.order, args.metricNames, args.dimensionNames),
    metricAggregations: ['TOTAL'],
  };
  const dimensionFilter = buildDimensionFilter(args.filter);
  if (dimensionFilter) baseBody.dimensionFilter = dimensionFilter;

  const current = await runReport({
    accessToken, propertyId,
    body: { ...baseBody, dateRanges: [{ startDate, endDate }] },
  });
  const currentRows = shapeRows(current, args.dimensionNames, args.metricNames);

  const output = {
    property: `properties/${propertyId}`,
    dimensions: args.dimensionNames,
    metrics: args.metricNames,
    startDate, endDate,
    filters: args.filter || null,
    totals: (current.totals?.[0]?.metricValues || []).reduce((acc, mv, i) => {
      acc[args.metricNames[i]] = num(mv.value); return acc;
    }, {}),
  };

  if (args.compare) {
    const len = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
    const prevEnd = isoDate(addDays(new Date(startDate), -1));
    const prevStart = isoDate(addDays(new Date(prevEnd), -(len - 1)));
    const previous = await runReport({
      accessToken, propertyId,
      body: { ...baseBody, dateRanges: [{ startDate: prevStart, endDate: prevEnd }] },
    });
    const prevRows = shapeRows(previous, args.dimensionNames, args.metricNames);
    const prevMap = new Map(prevRows.map((r) => [joinKey(args.dimensionNames, r.dims), r]));
    const seen = new Set();
    const rows = [];
    for (const cur of currentRows) {
      const k = joinKey(args.dimensionNames, cur.dims);
      seen.add(k);
      const prev = prevMap.get(k);
      rows.push(comparedRow(args, cur, prev));
    }
    for (const prev of prevRows) {
      const k = joinKey(args.dimensionNames, prev.dims);
      if (!seen.has(k)) rows.push(comparedRow(args, null, prev));
    }
    const sortMetric = args.metricNames[0];
    rows.sort((a, b) => Math.abs((b.delta[sortMetric] ?? 0)) - Math.abs((a.delta[sortMetric] ?? 0)));
    output.compare = { startDate: prevStart, endDate: prevEnd };
    output.rows = rows;
  } else {
    output.rows = currentRows.map((r) => ({ ...identity(args.dimensionNames, r.dims), ...r.metrics }));
  }
  output.rowCount = output.rows.length;

  const content = args.format === 'csv' ? toCsv(output, args) : JSON.stringify(output, null, 2);
  if (args.out) {
    fs.writeFileSync(args.out, content, 'utf8');
    console.error(`Wrote ${output.rowCount} row(s) to ${args.out}`);
  } else {
    console.log(content);
  }
}

function comparedRow(args, cur, prev) {
  const idRow = (cur || prev).dims;
  const c = cur ? cur.metrics : null;
  const p = prev ? prev.metrics : null;
  const status = c && p ? 'both' : c ? 'new' : 'lost';
  const row = { ...identity(args.dimensionNames, idRow), status, previous: p, delta: {} };
  for (const m of args.metricNames) {
    const cv = c ? c[m] : 0;
    const pv = p ? p[m] : 0;
    row[m] = cv;
    row.delta[m] = (typeof cv === 'number' && typeof pv === 'number') ? cv - pv : null;
  }
  return row;
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(output, args) {
  const dims = args.dimensionNames;
  const metrics = args.metricNames;
  const compare = Boolean(output.compare);
  const header = [...dims, ...metrics];
  if (compare) {
    for (const m of metrics) header.push(`prev_${m}`, `delta_${m}`);
    header.push('status');
  }
  const lines = [header.map(csvCell).join(',')];
  for (const r of output.rows) {
    const dimVals = dims.length === 1 ? [r.key] : dims.map((d) => r.keys?.[d] ?? (dims.length === 0 ? 'total' : ''));
    const cells = [...dimVals, ...metrics.map((m) => r[m])];
    if (compare) {
      for (const m of metrics) cells.push(r.previous?.[m], r.delta?.[m]);
      cells.push(r.status);
    }
    lines.push(cells.map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
