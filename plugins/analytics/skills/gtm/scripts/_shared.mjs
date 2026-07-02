// _shared.mjs — common auth + config helpers for the gtm scripts.
//
// Credentials live in the 1Password item `GOOGLE SERVICES TOKEN`
// (vault `Env Variables & Secrets`): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN — the SAME item the ga4/gsc skills use. The refresh token
// must carry the tagmanager.readonly scope (run ga4/scripts/google-login.mjs).
//
// Config comes from the `gtm` object in the nearest .refact-os.json:
//   "gtm": { "publicId": "GTM-XXXXXXX", "containerName": "example.com" }
// The Tag Manager API addresses containers by NUMERIC accountId + containerId,
// not the public GTM-XXXX id, so resolveContainer() looks them up by publicId.
// Optionally cache the resolved numeric ids as gtm.accountId / gtm.containerId.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export const OP_VAULT = 'Env Variables & Secrets';
export const OP_ITEM = 'GOOGLE SERVICES TOKEN';
export const TM_BASE = 'https://tagmanager.googleapis.com/tagmanager/v2';

export function readFrom1Password(field) {
  try {
    const out = execSync(
      `op item get "${OP_ITEM}" --vault "${OP_VAULT}" --fields label=${field} --reveal`,
      { encoding: 'utf8' },
    );
    return out.trim();
  } catch (e) {
    throw new Error(
      `Could not read "${field}" from 1Password item "${OP_ITEM}" (vault "${OP_VAULT}").\n` +
      `Make sure the item exists and that 'op' is signed in.\n` +
      `Original error: ${e.message}`
    );
  }
}

export function findRefactOsJson(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, '.refact-os.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readGtmConfig() {
  const file = findRefactOsJson(process.cwd());
  if (!file) throw new Error('Could not find .refact-os.json. Run this from inside a project.');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  return json?.gtm ?? {};
}

export async function getAccessToken() {
  const clientId = readFrom1Password('GOOGLE_CLIENT_ID');
  const clientSecret = readFrom1Password('GOOGLE_CLIENT_SECRET');
  const refreshToken = readFrom1Password('GOOGLE_REFRESH_TOKEN');
  if (!refreshToken) {
    throw new Error(
      'GOOGLE_REFRESH_TOKEN is empty in 1Password. Run ga4/scripts/google-login.mjs once ' +
      '(it requests the tagmanager scope too).'
    );
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to refresh access token (${res.status}): ${text}\n` +
      `If this mentions insufficient scope, the token predates the tagmanager scope — ` +
      `re-run ga4/scripts/google-login.mjs to upgrade it.`
    );
  }
  return (await res.json()).access_token;
}

export async function tmGet(accessToken, urlPath) {
  const res = await fetch(`${TM_BASE}/${urlPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Tag Manager API GET ${urlPath} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// Write helper (POST/PUT). Used only for workspace-scoped edits — never for
// publishing or deleting (no such code path exists, by design).
export async function tmWrite(accessToken, method, urlPath, body) {
  const res = await fetch(`${TM_BASE}/${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Tag Manager API ${method} ${urlPath} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// Find a workspace by name under a container; optionally create it if missing.
// Edits always go to a workspace (a draft), never to the live container.
export async function resolveWorkspace(accessToken, { accountId, containerId }, name, { create = false } = {}) {
  const parent = `accounts/${accountId}/containers/${containerId}`;
  const existing = (await tmGet(accessToken, `${parent}/workspaces`)).workspace || [];
  const found = existing.find((w) => w.name === name);
  if (found) return found;
  if (!create) {
    const names = existing.map((w) => w.name).join(', ') || '(none)';
    throw new Error(`Workspace "${name}" not found. Existing: ${names}. Pass create:true (or --create) to make it.`);
  }
  return tmWrite(accessToken, 'POST', `${parent}/workspaces`, { name });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every account + container the connected user can see (numeric ids + publicId).
// Paced to stay under the Tag Manager quota (30 queries/min/user) when the
// account is a member of many GTM accounts. For a known container, prefer
// caching gtm.accountId/containerId so resolveContainer skips this scan entirely.
export async function listContainers(accessToken) {
  const accounts = (await tmGet(accessToken, 'accounts')).account || [];
  const out = [];
  for (let i = 0; i < accounts.length; i++) {
    if (i > 0) await sleep(2200); // ~27 req/min — under the 30/min cap
    const acc = accounts[i];
    const containers = (await tmGet(accessToken, `accounts/${acc.accountId}/containers`)).container || [];
    for (const c of containers) {
      out.push({
        accountId: acc.accountId, accountName: acc.name,
        containerId: c.containerId, name: c.name, publicId: c.publicId,
        usageContext: c.usageContext,
      });
    }
  }
  return out;
}

// Resolve numeric accountId + containerId for the configured container. Uses
// cached gtm.accountId/containerId if present, else matches gtm.publicId.
export async function resolveContainer(accessToken) {
  const cfg = readGtmConfig();
  if (cfg.accountId && cfg.containerId) {
    return { accountId: String(cfg.accountId), containerId: String(cfg.containerId), publicId: cfg.publicId ?? null };
  }
  if (!cfg.publicId) {
    throw new Error(
      'No gtm.publicId (or gtm.accountId + gtm.containerId) in .refact-os.json. ' +
      'Run gtm-list.mjs to see accessible containers, then add e.g.:\n' +
      '  "gtm": { "publicId": "GTM-XXXXXXX", "containerName": "example.com" }'
    );
  }
  const all = await listContainers(accessToken);
  const want = String(cfg.publicId).toUpperCase();
  const match = all.find((c) => (c.publicId || '').toUpperCase() === want);
  if (!match) {
    const seen = all.map((c) => c.publicId).join(', ') || '(none)';
    throw new Error(
      `Container ${cfg.publicId} not found for the connected account. Accessible: ${seen}. ` +
      `Make sure that Google account has access to the container (GTM → Admin → User Management).`
    );
  }
  return { accountId: match.accountId, containerId: match.containerId, publicId: match.publicId };
}
