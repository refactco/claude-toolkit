#!/usr/bin/env node
/**
 * gsc-sites.mjs — list the Search Console properties the connected account can access.
 *
 * Read-only. Useful for discovering the exact property string (URL-prefix vs
 * sc-domain:) and confirming the project's gsc.siteUrl is actually accessible
 * before running other scripts.
 *
 * Reads creds from 1Password (see the connect reference / _shared.mjs). Does NOT
 * require gsc.siteUrl — but if .refact-os.json has one, the matching property is
 * flagged so you can confirm the configured value is valid.
 *
 * Usage:
 *   node gsc-sites.mjs
 */

import fs from 'node:fs';
import { getAccessToken, findRefactOsJson } from './_shared.mjs';

function configuredSiteUrl() {
  const file = findRefactOsJson(process.cwd());
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))?.gsc?.siteUrl ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const accessToken = await getAccessToken();
  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Sites list failed (${res.status}): ${await res.text()}`);
  const json = await res.json();

  const configured = configuredSiteUrl();
  const sites = (json.siteEntry || []).map((s) => ({
    siteUrl: s.siteUrl,
    permissionLevel: s.permissionLevel,
    configured: configured != null && s.siteUrl === configured,
  }));

  const output = {
    configuredSiteUrl: configured,
    configuredIsAccessible: configured != null && sites.some((s) => s.configured),
    siteCount: sites.length,
    sites,
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
