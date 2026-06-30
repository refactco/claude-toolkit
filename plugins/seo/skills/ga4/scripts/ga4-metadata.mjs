#!/usr/bin/env node
/**
 * ga4-metadata.mjs — discovery helper for GA4.
 *
 * Two modes:
 *   --list   List every GA4 account + property the connected account can access
 *            (Admin API accountSummaries). Use this to find the numeric property
 *            id to put in .refact-os.json › ga4.propertyId. Does NOT require a
 *            configured property.
 *   (default) Print the catalog of dimensions + metrics available for the
 *            configured property (Data API metadata) — the valid field names you
 *            can pass to ga4-report.mjs, including any custom dimensions/metrics.
 *
 * Reads creds from the 1Password item `GOOGLE SERVICES TOKEN`.
 *
 * Usage:
 *   node ga4-metadata.mjs --list
 *   node ga4-metadata.mjs
 */

import { getAccessToken, readPropertyId } from './_shared.mjs';

async function listAccountSummaries(accessToken) {
  const out = [];
  let pageToken = '';
  do {
    const url = new URL('https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Admin API accountSummaries failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    for (const acc of json.accountSummaries || []) {
      out.push({
        account: acc.account,
        accountName: acc.displayName,
        properties: (acc.propertySummaries || []).map((p) => ({
          property: p.property,
          propertyId: p.property?.replace(/^properties\//, '') ?? null,
          displayName: p.displayName,
          propertyType: p.propertyType,
        })),
      });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function fetchFieldCatalog(accessToken, propertyId) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}/metadata`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Data API metadata failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  const map = (arr) => (arr || []).map((f) => ({
    apiName: f.apiName, uiName: f.uiName, custom: Boolean(f.customDefinition),
    category: f.category,
  }));
  return {
    property: `properties/${propertyId}`,
    dimensions: map(json.dimensions),
    metrics: map(json.metrics),
  };
}

async function main() {
  const list = process.argv.slice(2).includes('--list');
  const accessToken = await getAccessToken();
  if (list) {
    console.log(JSON.stringify({ accounts: await listAccountSummaries(accessToken) }, null, 2));
  } else {
    console.log(JSON.stringify(await fetchFieldCatalog(accessToken, readPropertyId()), null, 2));
  }
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
