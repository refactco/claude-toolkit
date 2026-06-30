#!/usr/bin/env node
/**
 * gsc-sitemaps.mjs — list, submit, or delete sitemaps for the configured property.
 *
 * Reads the property from gsc.siteUrl in .refact-os.json and creds from 1Password
 * (see the connect reference / _shared.mjs).
 *
 * Flags:
 *   (none)            List all submitted sitemaps with submitted/indexed counts,
 *                     pending state, and any warnings/errors. Read-only.
 *   --submit=URL      Submit (or resubmit) a sitemap to Search Console. WRITE.
 *   --delete=URL      Remove a sitemap from Search Console. WRITE.
 *   --confirm         Required alongside --submit/--delete. The script refuses to
 *                     run a write without it.
 *
 * Examples:
 *   node gsc-sitemaps.mjs
 *   node gsc-sitemaps.mjs --submit=https://example.com/sitemap.xml --confirm
 *   node gsc-sitemaps.mjs --delete=https://example.com/old-sitemap.xml --confirm
 *
 * APPROVAL GATE: --submit and --delete change Search Console state. The agent MUST
 * show the user the exact action and obtain their explicit written approval in a
 * chat message BEFORE running, and only then pass --confirm. Never add --confirm
 * on the user's behalf without that written approval.
 */

import { getAccessToken, readSiteUrl } from './_shared.mjs';

const BASE = 'https://searchconsole.googleapis.com/webmasters/v3/sites';

function parseArgs(argv) {
  const args = { submit: null, delete: null, confirm: false };
  for (const a of argv.slice(2)) {
    if (a === '--confirm') { args.confirm = true; continue; }
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (!m) continue;
    if (m[1] === 'submit') args.submit = m[2];
    else if (m[1] === 'delete') args.delete = m[2];
  }
  if (args.submit && args.delete) {
    throw new Error('Use only one of --submit or --delete per run.');
  }
  if ((args.submit || args.delete) && !args.confirm) {
    const action = args.submit ? `submit ${args.submit}` : `delete ${args.delete}`;
    throw new Error(
      `Refusing to ${action}: this changes Search Console state.\n` +
      `Get the user's explicit written approval in a chat message first, then re-run with --confirm.`
    );
  }
  return args;
}

async function listSitemaps(accessToken, siteUrl) {
  const url = `${BASE}/${encodeURIComponent(siteUrl)}/sitemaps`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Sitemaps list failed (${res.status}): ${await res.text()}`);
  const json = await res.json();

  const sitemaps = (json.sitemap || []).map((s) => {
    // Each "contents" entry breaks down submitted/indexed by type (web, image, …).
    const contents = (s.contents || []).map((c) => ({
      type: c.type,
      submitted: Number(c.submitted ?? 0),
      indexed: Number(c.indexed ?? 0),
    }));
    const submitted = contents.reduce((n, c) => n + c.submitted, 0);
    const indexed = contents.reduce((n, c) => n + c.indexed, 0);
    return {
      path: s.path,
      type: s.type ?? null,
      isSitemapsIndex: Boolean(s.isSitemapsIndex),
      isPending: Boolean(s.isPending),
      lastSubmitted: s.lastSubmitted ?? null,
      lastDownloaded: s.lastDownloaded ?? null,
      warnings: Number(s.warnings ?? 0),
      errors: Number(s.errors ?? 0),
      submitted,
      indexed,
      contents,
    };
  });

  return {
    site: siteUrl,
    action: 'list',
    sitemapCount: sitemaps.length,
    sitemaps,
  };
}

async function writeSitemap(accessToken, siteUrl, feedUrl, method) {
  const url = `${BASE}/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedUrl)}`;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Sitemap ${method} failed (${res.status}): ${await res.text()}`);
  }
  return { site: siteUrl, action: method === 'PUT' ? 'submit' : 'delete', feed: feedUrl, ok: true };
}

async function main() {
  const args = parseArgs(process.argv);
  const siteUrl = readSiteUrl();
  const accessToken = await getAccessToken();

  let output;
  if (args.submit) {
    output = await writeSitemap(accessToken, siteUrl, args.submit, 'PUT');
  } else if (args.delete) {
    output = await writeSitemap(accessToken, siteUrl, args.delete, 'DELETE');
  } else {
    output = await listSitemaps(accessToken, siteUrl);
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
