#!/usr/bin/env node
/**
 * gsc-login.mjs — one-time OAuth login for the Google Search Console scripts.
 *
 * What it does:
 *   1. Reads GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET from the 1Password item
 *      `GOOGLE SERVICES TOKEN` (vault `Env Variables & Secrets`).
 *   2. Starts a tiny local server on http://localhost:8765 to catch the redirect.
 *   3. Opens your browser to Google's consent screen.
 *   4. You log in with the Google account that has access to the GSC properties.
 *   5. Google redirects back with a code; the script exchanges it for a refresh token.
 *   6. The refresh token is saved back as GOOGLE_REFRESH_TOKEN on the same item.
 *
 * After this runs once, the other gsc scripts run forever without further logins.
 *
 * Prerequisites:
 *   - 1Password CLI (`op`) installed and signed in.
 *   - In Google Cloud Console: http://localhost:8765/callback added to the OAuth
 *     client's "Authorized redirect URIs".
 *   - Search Console API enabled on the same Google Cloud project.
 *
 * Usage:
 *   node gsc-login.mjs
 */

import http from 'node:http';
import { execSync } from 'node:child_process';
import { URL } from 'node:url';
import { readFrom1Password, writeTo1Password } from './_shared.mjs';

const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
// Full webmasters scope: read everything (performance, inspection, sitemap
// listing) plus sitemap submit/delete. Use ...webmasters.readonly instead if you
// want to forbid all writes.
const SCOPE = 'https://www.googleapis.com/auth/webmasters';

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
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline'); // required to get a refresh token
  authUrl.searchParams.set('prompt', 'consent');      // forces refresh token issuance

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

  console.log('\nDone. The gsc scripts are ready to use.');
}

main().catch((e) => {
  console.error(`\nLogin failed: ${e.message}`);
  process.exit(1);
});
