// _shared.mjs — common auth + config helpers for the ga4 scripts.
//
// Credentials live in the 1Password item `GOOGLE SERVICES TOKEN`
// (vault `Env Variables & Secrets`): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN — the SAME item the gsc/pagespeed skills use. The refresh
// token must have been minted with the analytics scope (run google-login.mjs).
// The target property comes from ga4.propertyId in the nearest .refact-os.json.

import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

export const OP_VAULT = 'Env Variables & Secrets';
export const OP_ITEM = 'GOOGLE SERVICES TOKEN';

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

export function writeTo1Password(field, value) {
  try {
    // execFile (no shell) so the secret value can't be mangled by shell parsing.
    execFileSync('op', ['item', 'edit', OP_ITEM, '--vault', OP_VAULT, `${field}=${value}`], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(
      `Could not write "${field}" to 1Password item "${OP_ITEM}" (vault "${OP_VAULT}").\n` +
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

// Reads ga4.propertyId from the nearest .refact-os.json. Accepts a bare numeric
// id ("123456789") or the full resource name ("properties/123456789") and always
// returns the bare numeric id.
export function readPropertyId() {
  const file = findRefactOsJson(process.cwd());
  if (!file) {
    throw new Error('Could not find .refact-os.json. Run this from inside a project.');
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const raw = json?.ga4?.propertyId;
  if (!raw) {
    throw new Error(
      `No ga4.propertyId in ${file}. Add the GA4 property's numeric id, then re-run:\n` +
      `  "ga4": { "propertyId": "123456789" }\n` +
      `Run ga4-metadata.mjs --list to discover the properties this account can see.`
    );
  }
  return String(raw).replace(/^properties\//, '');
}

// Reads creds from 1Password and exchanges the refresh token for a short-lived
// access token. Throws a clear message if the refresh token is missing/expired.
export async function getAccessToken() {
  const clientId = readFrom1Password('GOOGLE_CLIENT_ID');
  const clientSecret = readFrom1Password('GOOGLE_CLIENT_SECRET');
  const refreshToken = readFrom1Password('GOOGLE_REFRESH_TOKEN');
  if (!refreshToken) {
    throw new Error(
      'GOOGLE_REFRESH_TOKEN is empty in 1Password. Run google-login.mjs once to set it up ' +
      '(see the SKILL.md "Connect" section).'
    );
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to refresh access token (${res.status}): ${text}\n` +
      `If this says "invalid_grant", re-run google-login.mjs. If it mentions insufficient ` +
      `scope, the token predates the analytics scope — re-run google-login.mjs to upgrade it.`
    );
  }
  const json = await res.json();
  return json.access_token;
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
