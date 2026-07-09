// _shared.mjs — common auth + config helpers for the gsc scripts.
//
// The generic helpers (1Password access, .refact-os.json lookup, OAuth token
// exchange, date utils) live in the pack-shared ../../../lib/common.mjs; this
// file re-exports them for the sibling scripts and adds the gsc-specific
// config reader + error hints. Sibling scripts import from './_shared.mjs' only.
//
// Credentials live in the 1Password item `GOOGLE SERVICES TOKEN`
// (vault `Env Variables & Secrets`): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN. The target property comes from gsc.siteUrl in the
// nearest .refact-os.json.

import fs from 'node:fs';
import {
  findRefactOsJson,
  getAccessToken as getGoogleAccessToken,
} from '../../../lib/common.mjs';

export {
  OP_VAULT,
  OP_ITEM,
  readFrom1Password,
  writeTo1Password,
  findRefactOsJson,
  isoDate,
  addDays,
} from '../../../lib/common.mjs';

export function readSiteUrl() {
  const file = findRefactOsJson(process.cwd());
  if (!file) {
    throw new Error('Could not find .refact-os.json. Run this from inside a project.');
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const siteUrl = json?.gsc?.siteUrl;
  if (!siteUrl) {
    throw new Error(
      `No gsc.siteUrl in ${file}. Ask the user for the site's GSC property URL, ` +
      `then add it to the project's .refact-os.json before re-running:\n` +
      `  "gsc": { "siteUrl": "https://example.com/" }\n` +
      `Or for a domain property:\n` +
      `  "gsc": { "siteUrl": "sc-domain:example.com" }`
    );
  }
  return siteUrl;
}

// Reads creds from 1Password and exchanges the refresh token for a short-lived
// access token. gsc-specific hints point at the shared login script, which
// lives in the ga4 skill.
export function getAccessToken() {
  return getGoogleAccessToken({
    missingTokenHint:
      'GOOGLE_REFRESH_TOKEN is empty in 1Password. Run the shared login once to set it up: ' +
      'node <plugin>/skills/ga4/scripts/google-login.mjs (see the connect reference).',
    invalidGrantHint:
      'If this says "invalid_grant", the refresh token is no longer valid — re-run the shared login (skills/ga4/scripts/google-login.mjs).',
  });
}
