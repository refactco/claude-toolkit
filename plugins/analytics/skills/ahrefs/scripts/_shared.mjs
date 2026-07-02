// _shared.mjs — auth + config helpers for the ahrefs HEADLESS-FALLBACK scripts.
//
// The PRIMARY way to use Ahrefs in this skill is the connected Ahrefs MCP (no
// token needed). These scripts are the fallback for headless/cron runs where the
// claude.ai MCP isn't available — they call the Ahrefs API v3 directly.
//
// Token: a 1Password item (default `AHREFS API TOKEN`, field `AHREFS_API_TOKEN`,
// vault `Env Variables & Secrets`); override via .refact-os.json › ahrefs.
// Requires a paid Ahrefs API plan. Project/target come from .refact-os.json.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export const API_BASE = 'https://api.ahrefs.com/v3';
const DEFAULT_VAULT = 'Env Variables & Secrets';
const DEFAULT_ITEM = 'AHREFS API TOKEN';
const DEFAULT_FIELD = 'AHREFS_API_TOKEN';

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

export function readAhrefsConfig() {
  const file = findRefactOsJson(process.cwd());
  if (!file) throw new Error('Could not find .refact-os.json. Run this from inside a project.');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  return json?.ahrefs ?? {};
}

export function readProjectId() {
  const cfg = readAhrefsConfig();
  if (!cfg.projectId) {
    throw new Error(
      'No ahrefs.projectId in .refact-os.json. Find it in the Site Audit URL ' +
      '(https://app.ahrefs.com/site-audit/<projectId>) and add:\n' +
      '  "ahrefs": { "projectId": 12345678 }'
    );
  }
  return cfg.projectId;
}

export function readToken() {
  const cfg = readAhrefsConfig();
  const item = cfg.apiTokenItem || DEFAULT_ITEM;
  const field = cfg.apiTokenField || DEFAULT_FIELD;
  // Literal env wins (handy for CI); else read the 1Password item via `op`.
  if (process.env[field]) return process.env[field].trim();
  try {
    return execSync(
      `op item get "${item}" --vault "${DEFAULT_VAULT}" --fields label=${field} --reveal`,
      { encoding: 'utf8' },
    ).trim();
  } catch (e) {
    throw new Error(
      `Could not read the Ahrefs API token (field "${field}" of 1Password item "${item}", ` +
      `vault "${DEFAULT_VAULT}"), and $${field} is unset.\n` +
      `The headless scripts need a paid Ahrefs API token. Prefer the Ahrefs MCP for interactive use.\n` +
      `Original error: ${e.message}`
    );
  }
}

// GET https://api.ahrefs.com/v3/<endpoint>?<params>. `endpoint` is the path after
// /v3/ (e.g. "site-audit/issues", "site-explorer/organic-keywords").
export async function ahrefsGet(endpoint, params = {}) {
  const token = readToken();
  const url = new URL(`${API_BASE}/${endpoint.replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  if (!url.searchParams.has('output')) url.searchParams.set('output', 'json');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Ahrefs API GET /${endpoint} failed (${res.status}): ${text}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}
