#!/usr/bin/env node
/**
 * ga4-realtime.mjs — active users right now via the GA4 Data API runRealtimeReport.
 *
 * Realtime covers roughly the last 30 minutes. Only a restricted set of realtime
 * dimensions/metrics is allowed (e.g. dimensions: country, deviceCategory,
 * unifiedScreenName, eventName; metrics: activeUsers, screenPageViews, eventCount).
 *
 * Flags:
 *   --dimensions=...  Comma-separated realtime dimensions (default: country).
 *   --metrics=...     Comma-separated realtime metrics (default: activeUsers).
 *   --limit=N         Max rows (default 50).
 *
 * Usage:
 *   node ga4-realtime.mjs
 *   node ga4-realtime.mjs --dimensions=unifiedScreenName --metrics=activeUsers --limit=20
 */

import { getAccessToken, readPropertyId } from './_shared.mjs';

function parseArgs(argv) {
  const args = { dimensions: 'country', metrics: 'activeUsers', limit: 50 };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m && m[1] in args) args[m[1]] = m[2];
  }
  args.dimensionNames = args.dimensions.split(',').map((d) => d.trim()).filter(Boolean);
  args.metricNames = args.metrics.split(',').map((m) => m.trim()).filter(Boolean);
  args.limit = parseInt(args.limit, 10) || 50;
  return args;
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : v; }

async function main() {
  const args = parseArgs(process.argv);
  const propertyId = readPropertyId();
  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dimensions: args.dimensionNames.map((name) => ({ name })),
        metrics: args.metricNames.map((name) => ({ name })),
        limit: args.limit,
      }),
    },
  );
  if (!res.ok) throw new Error(`GA4 runRealtimeReport failed (${res.status}): ${await res.text()}`);
  const json = await res.json();

  const rows = (json.rows || []).map((r) => {
    const o = {};
    args.dimensionNames.forEach((d, i) => { o[d] = r.dimensionValues?.[i]?.value ?? null; });
    args.metricNames.forEach((m, i) => { o[m] = num(r.metricValues?.[i]?.value); });
    return o;
  });

  console.log(JSON.stringify({
    property: `properties/${propertyId}`,
    dimensions: args.dimensionNames,
    metrics: args.metricNames,
    totalActiveUsers: num(json.totals?.[0]?.metricValues?.[0]?.value ?? null),
    rowCount: rows.length,
    rows,
  }, null, 2));
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
