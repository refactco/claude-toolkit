#!/usr/bin/env node
/**
 * google-login.mjs — one OAuth login that covers GA4, GTM, and Search Console.
 *
 * The ga4, gtm, and gsc skills all share ONE refresh token on the 1Password item
 * `GOOGLE SERVICES TOKEN`. This script mints that token with the union of scopes
 * they need, so a single login enables all three. Re-running it UPGRADES the
 * existing token (e.g. when an older gsc-only token lacks the analytics scope).
 *
 * What it does:
 *   1. Reads GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET from the 1Password item.
 *   2. Starts a tiny local server on http://localhost:8765 to catch the redirect.
 *   3. Opens your browser to Google's consent screen.
 *   4. You log in with the Google account that has access to the GA4 property,
 *      the GTM container, and the GSC property.
 *   5. Google redirects back with a code; the script exchanges it for a refresh token.
 *   6. The refresh token is saved back as GOOGLE_REFRESH_TOKEN on the same item.
 *
 * Prerequisites (one-time, in the Google Cloud project behind the OAuth client):
 *   - 1Password CLI (`op`) installed and signed in.
 *   - http://localhost:8765/callback added to the OAuth client's "Authorized
 *     redirect URIs" (APIs & Services → Credentials).
 *   - These APIs enabled: Google Analytics Data API, Google Analytics Admin API,
 *     Tag Manager API, Search Console API.
 *
 * Usage:
 *   node google-login.mjs
 */

import http from 'node:http';
import { execSync } from 'node:child_process';
import { URL } from 'node:url';
import { readFrom1Password, writeTo1Password } from './_shared.mjs';

const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
// Union of every scope the Google-services skills need:
//   webmasters               — gsc reads + sitemap submit/delete
//   analytics.readonly       — ga4 Data API + Admin API (read)
//   analytics.edit           — ga4 Admin API config writes (key events, custom
//                              dims/metrics, data streams, property settings)
//   analytics.manage.users   — ga4 access-binding management
//   tagmanager.readonly      — gtm container/version read
//   tagmanager.edit.containers — gtm workspace edits (tags/triggers/variables)
//
// Deliberately EXCLUDED (authority = "edit only, human publishes"; no deletes):
//   tagmanager.publish, tagmanager.delete.containers
// GA4's Admin API has no publish/scope split — writes are live on confirm, and
// the edit scope technically also permits deletes, so the no-delete guarantee is
// enforced at the SCRIPT level (no delete code path exists), not by scope.
const SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.edit',
  'https://www.googleapis.com/auth/analytics.manage.users',
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
];

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === 'darwin' ? `open "${url}"` :
    platform === 'win32'  ? `start "" "${url}"` :
                            `xdg-open "${url}"`;
  try {
    execSync(cmd);
  } catch {
    console.log(`\nCould not open browser automatically. Open this URL manually:\n${url}\n`);
  }
}

async function main() {
  console.log('Reading GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from 1Password...');
  const clientId     = readFrom1Password('GOOGLE_CLIENT_ID');
  const clientSecret = readFrom1Password('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is empty in the 1Password item.');
    process.exit(1);
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline'); // required to get a refresh token
  authUrl.searchParams.set('prompt', 'consent');      // forces refresh token issuance
  authUrl.searchParams.set('include_granted_scopes', 'true');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
      if (u.pathname !== '/callback') {
        res.writeHead(404); res.end(); return;
      }
      const c = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`OAuth error: ${err}. You can close this tab.`);
        server.close();
        reject(new Error(`OAuth error: ${err}`));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Logged in. You can close this tab and return to the terminal.');
      server.close();
      resolve(c);
    });
    server.on('error', (err) => {
      reject(err.code === 'EADDRINUSE'
        ? new Error(`Port ${REDIRECT_PORT} is already in use — close the other process (or a stale login run) and retry.`)
        : err);
    });
    server.listen(REDIRECT_PORT, () => {
      console.log('Opening browser for Google login...');
      console.log(`If it does not open, paste this URL manually:\n${authUrl.toString()}\n`);
      openBrowser(authUrl.toString());
    });
  });

  console.log('Exchanging code for refresh token...');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${text}`);
  }

  const tokenJson = await tokenRes.json();
  const refreshToken = tokenJson.refresh_token;

  if (!refreshToken) {
    throw new Error(
      'Google did not return a refresh_token. This usually means you have already\n' +
      'authorized this app for this Google account before. Go to\n' +
      'https://myaccount.google.com/permissions , remove this app, then re-run.'
    );
  }

  console.log('Saving GOOGLE_REFRESH_TOKEN to 1Password...');
  writeTo1Password('GOOGLE_REFRESH_TOKEN', refreshToken);

  console.log('\nDone. The ga4, gtm, and gsc scripts are ready to use.');
}

main().catch((e) => {
  console.error(`\nLogin failed: ${e.message}`);
  process.exit(1);
});
