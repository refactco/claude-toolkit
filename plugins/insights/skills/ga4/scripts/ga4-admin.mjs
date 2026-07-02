#!/usr/bin/env node
/**
 * ga4-admin.mjs — manage GA4 *configuration* via the Analytics Admin API.
 *
 * Covers: key events (conversions), custom dimensions, custom metrics, data
 * streams, property settings (data retention, attribution), and access bindings.
 *
 * IMPORTANT — authority model: "edit only, human publishes".
 *   - GA4 has NO draft/publish model: a create/update is LIVE immediately.
 *   - Therefore every write here is hard-gated behind --confirm, and the agent
 *     must get the user's explicit written approval in chat before passing it.
 *     Never pass --confirm on the user's behalf without that go-ahead.
 *   - There is NO delete code path, by design (no-delete guarantee).
 *   - list/get are read-only and need no confirm.
 *
 * Usage:
 *   node ga4-admin.mjs list <resource>
 *   node ga4-admin.mjs get  <resource> [--name=<resourceName>]
 *   node ga4-admin.mjs create <resource> --data='{...}' --confirm
 *   node ga4-admin.mjs update <resource> --name=<resourceName> --mask=field1,field2 --data='{...}' --confirm
 *
 *   <resource> = keyEvents | customDimensions | customMetrics | dataStreams
 *              | accessBindings | dataRetention | attribution
 *
 *   --api=v1beta|v1alpha   Override the API version for a resource (default per
 *                          the table below). Use if a call returns NOT_FOUND.
 *
 * Examples:
 *   node ga4-admin.mjs list keyEvents
 *   node ga4-admin.mjs list customDimensions
 *   node ga4-admin.mjs get dataRetention
 *   node ga4-admin.mjs create keyEvents --data='{"eventName":"generate_lead","countingMethod":"ONCE_PER_EVENT"}' --confirm
 *   node ga4-admin.mjs create customDimensions --data='{"parameterName":"plan","displayName":"Plan","scope":"EVENT"}' --confirm
 *   node ga4-admin.mjs update dataRetention --mask=eventDataRetention --data='{"eventDataRetention":"FOURTEEN_MONTHS"}' --confirm
 *
 * The --data shape is the Admin API resource body. To see the exact fields a
 * resource expects, run `list`/`get` first and mirror the returned shape.
 */

import fs from 'node:fs';
import { getAccessToken, readPropertyId } from './_shared.mjs';

const ADMIN_BASE = 'https://analyticsadmin.googleapis.com';

// resource -> how to address it. `collection` resources support list+create;
// `singleton` resources (one per property) support get+update only.
const RESOURCES = {
  keyEvents:        { kind: 'collection', api: 'v1beta',  path: 'keyEvents',        listKey: 'keyEvents' },
  customDimensions: { kind: 'collection', api: 'v1beta',  path: 'customDimensions', listKey: 'customDimensions' },
  customMetrics:    { kind: 'collection', api: 'v1beta',  path: 'customMetrics',    listKey: 'customMetrics' },
  dataStreams:      { kind: 'collection', api: 'v1beta',  path: 'dataStreams',      listKey: 'dataStreams' },
  accessBindings:   { kind: 'collection', api: 'v1beta',  path: 'accessBindings',   listKey: 'accessBindings' },
  dataRetention:    { kind: 'singleton',  api: 'v1beta',  path: 'dataRetentionSettings' },
  attribution:      { kind: 'singleton',  api: 'v1beta',  path: 'attributionSettings' },
};

function parseFlags(argv) {
  const flags = { confirm: false };
  const positional = [];
  for (const a of argv) {
    if (a === '--confirm') { flags.confirm = true; continue; }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
    else if (!a.startsWith('--')) positional.push(a);
  }
  return { flags, positional };
}

async function adminRequest(accessToken, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Admin API ${method} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

function requireConfirm(flags, action) {
  if (!flags.confirm) {
    throw new Error(
      `Refusing to ${action} without --confirm. This is a LIVE change to the GA4 ` +
      `property (GA4 has no draft/publish step). Show the user exactly what will ` +
      `change, get their explicit written approval, then re-run with --confirm.`
    );
  }
}

function parseData(flags) {
  if (flags['data-file']) return JSON.parse(fs.readFileSync(flags['data-file'], 'utf8'));
  if (flags.data) {
    try { return JSON.parse(flags.data); }
    catch (e) { throw new Error(`--data is not valid JSON: ${e.message}`); }
  }
  throw new Error('Provide the resource body via --data=\'{...}\' (or --data-file=PATH).');
}

async function main() {
  const [command, resourceName, ...rest] = process.argv.slice(2);
  const { flags } = parseFlags([resourceName, ...rest].filter((x) => x != null));
  if (!command || !resourceName) {
    throw new Error('Usage: ga4-admin.mjs <list|get|create|update> <resource> [...]. See the file header.');
  }
  const def = RESOURCES[resourceName];
  if (!def) {
    throw new Error(`Unknown resource "${resourceName}". One of: ${Object.keys(RESOURCES).join(', ')}.`);
  }
  if (command === 'delete') {
    throw new Error('Delete is intentionally not supported (authority: edit only, no deletes). Do it in the GA4 UI.');
  }

  const api = flags.api || def.api;
  const propertyId = readPropertyId();
  const parent = `properties/${propertyId}`;

  // Validate + gate writes BEFORE touching credentials, so a no-confirm write
  // refuses cleanly without ever reading the 1Password token.
  let body, writeName;
  if (command === 'create') {
    if (def.kind !== 'collection') throw new Error(`"${resourceName}" can't be created — it's a per-property settings object. Use "update".`);
    body = parseData(flags);
    requireConfirm(flags, `create a ${resourceName} entry`);
  } else if (command === 'update') {
    body = parseData(flags);
    if (!flags.mask) throw new Error('--mask=field1,field2 is required for update (Admin API updateMask).');
    writeName = def.kind === 'singleton' ? `${parent}/${def.path}` : reqName(flags);
    requireConfirm(flags, `update ${writeName}`);
  } else if (!['list', 'get'].includes(command)) {
    throw new Error(`Unknown command "${command}". Use list | get | create | update.`);
  }

  const accessToken = await getAccessToken();

  if (command === 'list') {
    if (def.kind !== 'collection') throw new Error(`"${resourceName}" is a single settings object — use "get".`);
    const out = await adminRequest(accessToken, 'GET', `${ADMIN_BASE}/${api}/${parent}/${def.path}`);
    console.log(JSON.stringify({ resource: resourceName, items: out[def.listKey] || [] }, null, 2));
    return;
  }

  if (command === 'get') {
    // Singleton: GET the settings object. Collection: GET one item by --name.
    const url = def.kind === 'singleton'
      ? `${ADMIN_BASE}/${api}/${parent}/${def.path}`
      : `${ADMIN_BASE}/${api}/${reqName(flags)}`;
    console.log(JSON.stringify(await adminRequest(accessToken, 'GET', url), null, 2));
    return;
  }

  if (command === 'create') {
    const out = await adminRequest(accessToken, 'POST', `${ADMIN_BASE}/${api}/${parent}/${def.path}`, body);
    console.log(JSON.stringify({ created: out }, null, 2));
    return;
  }

  if (command === 'update') {
    const url = `${ADMIN_BASE}/${api}/${writeName}?updateMask=${encodeURIComponent(flags.mask)}`;
    const out = await adminRequest(accessToken, 'PATCH', url, body);
    console.log(JSON.stringify({ updated: out }, null, 2));
    return;
  }
}

function reqName(flags) {
  if (!flags.name) throw new Error('--name=<full resourceName> is required (e.g. properties/123/customDimensions/456). Run "list" to find it.');
  return flags.name.replace(/^\/+/, '');
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
