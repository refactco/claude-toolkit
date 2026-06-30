# Connect to Google Search Console

Use this when GSC isn't wired up yet, when `GOOGLE_REFRESH_TOKEN` is empty, when a
script reports `invalid_grant`, or when `.refact-os.json` has no `gsc.siteUrl`.

## 1. Credentials (1Password)

The 1Password item `GOOGLE SERVICES TOKEN` (vault `Env Variables & Secrets`) holds:

| Field | Set by | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | stored already | OAuth client (Google Cloud project) |
| `GOOGLE_CLIENT_SECRET` | stored already | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | the login flow below | written automatically on first login |

`op` must be installed and signed in (`op whoami`).

## 2. Target site (`.refact-os.json`)

Each project declares its property under a top-level `gsc` object:

```json
"gsc": { "siteUrl": "https://example.com/" }
```

For a **domain property** (covers all subdomains + protocols), use the `sc-domain:` prefix:

```json
"gsc": { "siteUrl": "sc-domain:example.com" }
```

**If `gsc.siteUrl` is missing, do not error out.** Ask the user for the property
URL, then write it into the project's `.refact-os.json` yourself before running any
GSC script.

To discover the exact property string (URL-prefix vs `sc-domain:`) and confirm the
account can access it, run the Sites API helper after auth:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-sites.mjs
```

It lists every accessible property with its `permissionLevel`, and — if
`.refact-os.json` already has a `gsc.siteUrl` — flags whether that configured value
is actually accessible (`configuredIsAccessible`). Use it to pick the right
`siteUrl` to write, or to debug a 403 ("the account doesn't have this property").

## 3. One-time login

If `GOOGLE_REFRESH_TOKEN` is empty (or you need to re-authorize), run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-login.mjs
```

This opens the browser, you sign in with the Google account that has GSC access,
and the script writes `GOOGLE_REFRESH_TOKEN` back to the 1Password item. After that,
every other gsc script runs with no further login.

**Scope:** the login requests the full `webmasters` scope so it covers reads *and*
sitemap submit/delete. If you only want read access, switch the `SCOPE` constant in
`gsc-login.mjs` to `...webmasters.readonly`. Changing the scope requires re-running
login to mint a new refresh token — an existing read-only token will get a 403 on
sitemap writes.

## Troubleshooting

- **`redirect_uri_mismatch`** — add `http://localhost:8765/callback` to the OAuth client's *Authorized redirect URIs* in Google Cloud Console (APIs & Services → Credentials), then re-run.
- **`Google Search Console API has not been used in project … or it is disabled`** (403) — enable the **Search Console API** for that Google Cloud project (APIs & Services → Library), wait a minute for propagation, retry.
- **`invalid_grant`** when running a script — the refresh token was revoked/expired. Re-run `gsc-login.mjs`.
- **Google did not return a refresh_token** — the account already authorized this app. Remove it at https://myaccount.google.com/permissions and re-run (the flow forces `prompt=consent`, but a prior grant without `access_type=offline` can still cause this).
- **Empty property list / 403 on a known site** — the signed-in Google account doesn't have access to that property, or the API was just enabled and is still propagating.
