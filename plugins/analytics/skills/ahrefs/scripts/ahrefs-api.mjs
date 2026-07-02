#!/usr/bin/env node
/**
 * ahrefs-api.mjs — generic Ahrefs API v3 client (headless fallback).
 *
 * Prefer the connected Ahrefs MCP for interactive use. This thin client is for
 * headless/cron runs: it authenticates from 1Password and calls any v3 endpoint.
 * Read-only (GET).
 *
 * Flags:
 *   --endpoint=PATH    Path after /v3/ (e.g. site-audit/issues,
 *                      site-explorer/organic-keywords, site-explorer/all-backlinks,
 *                      rank-tracker/overview, keywords-explorer/overview).
 *   --params='{...}'   JSON object of query params. Most Site Explorer / Keywords
 *                      endpoints require `select` (comma-separated fields) and a
 *                      `target` or `keyword`; see docs.ahrefs.com/docs/api/reference.
 *   --out=PATH         Write JSON to PATH instead of stdout.
 *
 * Examples:
 *   node ahrefs-api.mjs --endpoint=site-audit/issues --params='{"project_id":12345678}'
 *   node ahrefs-api.mjs --endpoint=site-explorer/organic-keywords \
 *     --params='{"target":"example.com/","country":"us","select":"keyword,volume,best_position","limit":50}'
 *   node ahrefs-api.mjs --endpoint=site-explorer/all-backlinks \
 *     --params='{"target":"example.com/","select":"url_from,url_to,domain_rating_source","limit":50}'
 */

import fs from 'node:fs';
import { ahrefsGet } from './_shared.mjs';

function parseFlags(argv) {
  const flags = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/s);
    if (m) flags[m[1]] = m[2];
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.endpoint) throw new Error('--endpoint=PATH is required (e.g. site-audit/issues).');
  let params = {};
  if (flags.params) {
    try { params = JSON.parse(flags.params); }
    catch (e) { throw new Error(`--params is not valid JSON: ${e.message}`); }
  }
  const data = await ahrefsGet(flags.endpoint, params);
  const content = JSON.stringify(data, null, 2);
  if (flags.out) {
    fs.writeFileSync(flags.out, content, 'utf8');
    console.error(`Wrote ${flags.endpoint} response to ${flags.out}`);
  } else {
    console.log(content);
  }
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
