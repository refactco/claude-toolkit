// _shared.mjs — common auth + config helpers for the ga4 scripts.
//
// The generic helpers (1Password access, .refact-os.json lookup, OAuth token
// exchange, date utils) live in the pack-shared ../../../lib/common.mjs; this
// file re-exports them for the sibling scripts and adds the ga4-specific
// config reader. Sibling scripts import from './_shared.mjs' only.
//
// Credentials live in the 1Password item `GOOGLE SERVICES TOKEN`
// (vault `Env Variables & Secrets`): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN — the SAME item the gsc/pagespeed skills use. The refresh
// token must have been minted with the analytics scope (run google-login.mjs).
// The target property comes from ga4.propertyId in the nearest .refact-os.json.

import fs from 'node:fs';
import { findRefactOsJson } from '../../../lib/common.mjs';

// getAccessToken's default error hints already point at ga4's google-login.mjs,
// so it re-exports unchanged here.
export {
  OP_VAULT,
  OP_ITEM,
  readFrom1Password,
  writeTo1Password,
  findRefactOsJson,
  getAccessToken,
  isoDate,
  addDays,
} from '../../../lib/common.mjs';

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
