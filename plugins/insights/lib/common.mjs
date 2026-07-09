// common.mjs — pack-shared helpers for the insights skills' headless scripts.
//
// Each skill keeps a thin scripts/_shared.mjs that imports from here and
// re-exports what its sibling scripts consume (plus any skill-specific helpers).
// Sibling scripts always import from './_shared.mjs', never from this file.
//
// What lives here:
//   - findRefactOsJson: walk up from a directory to the nearest .refact-os.json.
//   - readFrom1Password / writeTo1Password: field access on the shared Google
//     credentials 1Password item (`GOOGLE SERVICES TOKEN`).
//   - getAccessToken: OAuth refresh-token → short-lived access token exchange.
//     The error hints are parameterized so each skill can point the user at the
//     right login script / scope (defaults use the ga4 wording, since the shared
//     login lives at ga4/scripts/google-login.mjs).
//   - isoDate / addDays: small date utils.

import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

// 1Password coordinates for the shared Google credentials item used by the
// ga4 / gsc / gtm / pagespeed skills.
export const OP_VAULT = 'Env Variables & Secrets';
export const OP_ITEM = 'GOOGLE SERVICES TOKEN';

// Walk up from startDir to the nearest .refact-os.json; null if none found.
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

// Default hints match the ga4 skill (the shared login script lives there).
const DEFAULT_MISSING_TOKEN_HINT =
  'GOOGLE_REFRESH_TOKEN is empty in 1Password. Run google-login.mjs once to set it up ' +
  '(see the SKILL.md "Connect" section).';
const DEFAULT_INVALID_GRANT_HINT =
  'If this says "invalid_grant", re-run google-login.mjs. If it mentions insufficient ' +
  'scope, the token predates the analytics scope — re-run google-login.mjs to upgrade it.';

// Reads creds from 1Password and exchanges the refresh token for a short-lived
// access token. Throws a clear message if the refresh token is missing/expired.
// `missingTokenHint` is the full error message when GOOGLE_REFRESH_TOKEN is
// empty; `invalidGrantHint` is appended after the token-endpoint failure line.
export async function getAccessToken({
  missingTokenHint = DEFAULT_MISSING_TOKEN_HINT,
  invalidGrantHint = DEFAULT_INVALID_GRANT_HINT,
} = {}) {
  const clientId = readFrom1Password('GOOGLE_CLIENT_ID');
  const clientSecret = readFrom1Password('GOOGLE_CLIENT_SECRET');
  const refreshToken = readFrom1Password('GOOGLE_REFRESH_TOKEN');
  if (!refreshToken) {
    throw new Error(missingTokenHint);
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
      `Failed to refresh access token (${res.status}): ${text}\n` + invalidGrantHint
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
