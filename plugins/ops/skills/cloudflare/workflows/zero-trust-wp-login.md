# Workflow: Zero Trust WP Login

Put Cloudflare Access in front of `/wp-login.php` so brute-force traffic is challenged with email OTP before reaching the origin.

**When to use:** client reports brute-force on wp-login.php, high PHP CPU from login traffic, or asks to "lock down wp-admin" / "add 2FA to login".

**Do NOT use for:** form spam (Turnstile), IP/country blocks (waf-rules workflow).

**Conventions (see `../SKILL.md`):** Narration · MCP servers (`cloudflare-api`, `cloudflare-docs`, `cloudflare-audit-logs`) · Role check — **Super Admin required (Domain Admin silently fails on IdP / team-init pages)**.

## Preflight (both checkable via API)

### 1. Detect WP Engine GES bypass

List the apex `CNAME` records on the zone and check whether any content matches `wpeproxy` or `wpengine`. If matches found, stop — traffic transits WP Engine's Cloudflare and any Access app on the client's account is invisible. See `references/wordpress/wp-engine-ges-access.md`. The fix is at WP Engine, not here.

### 2. Detect existing challenge rule on wp-login.php

A Managed Challenge rule on `/wp-login.php` silently breaks login — Cloudflare drops POST bodies after a challenge.

Get the `http_request_firewall_custom` phase ruleset and look for any rule whose `expression` matches `/wp-login|wp-admin/` and whose `action` is one of `managed_challenge`, `challenge`, `js_challenge`. Disable any match via `rulesets.rules.edit({ ..., enabled: false })` **before** creating the Access app.

See `references/wordpress/managed-challenge-post-trap.md` for why.

## Create the Access app

Use `zeroTrust.access.applications.create` under `{{account_id}}` with these fields:

- `type: "self_hosted"`
- `name: "{{client_name}} - WordPress Login"`
- `domain: "{{client_domain}}/wp-login.php"` — host + path, no wildcard. Covers GET and POST.
- `session_duration: "24h"` — publisher default. Bump to `"720h"` only if asked.
- `auto_redirect_to_identity: false`
- `app_launcher_visible: false`
- `allowed_idps: []` — OTP is the implicit default with this empty.
- `skip_interstitial: false`

Then create an `allow` policy on the app with the approved emails:

```
include: [
  { email: { email: "editor@client.com" } },
  { email_domain: { domain: "refact.co" } },
]
```

Do **not** also wrap `/wp-admin/*` blindly — `admin-ajax.php` is hit by logged-out visitors (forms, mini-cart) and protecting it breaks the public site. See `references/wordpress/wp-admin-paths.md`.

## Verify

Fetch `https://{{client_domain}}/wp-login.php` with `redirect: "manual"`. Expect a redirect to a Cloudflare Access challenge URL. If status is 200 with HTML, Access is bypassed — recheck preflight #1 (GES).

After deploy, check the audit log (via `cloudflare-audit-logs` MCP) for `access.application` or `access.policy` create entries in the last hour.

## Failure → fix table

| Symptom | Cause | Fix |
|---|---|---|
| Login form loads directly, no Access page | Apex CNAME → `wpeproxy.com` (GES) | Stop; coordinate with WP Engine. See `wp-engine-ges-access.md`. |
| Access OTP succeeds, WP login POST hangs/loops | Leftover WAF challenge rule on wp-login | Disable per preflight #2 |
| OTP email never arrives | Email not in policy `include`, or client mail greylisting `notify.cloudflare.com` | Update policy `include`; allowlist sender |
| "You don't have permission" on app create | Domain Admin, not Super Admin | See SKILL.md § Role check |
| New editor can't log in | Email not in policy | `zeroTrust.access.applications.policies.update` to extend `include` |

## References

- [`references/wordpress/wp-engine-ges-access.md`](../references/wordpress/wp-engine-ges-access.md) — how GES routes traffic, how to confirm
- [`references/wordpress/managed-challenge-post-trap.md`](../references/wordpress/managed-challenge-post-trap.md) — why POST breaks after a challenge
- [`references/wordpress/access-app-setup.md`](../references/wordpress/access-app-setup.md) — full field reference for the app + policy APIs
- [`references/wordpress/wp-admin-paths.md`](../references/wordpress/wp-admin-paths.md) — safe paths to protect vs paths to leave open
