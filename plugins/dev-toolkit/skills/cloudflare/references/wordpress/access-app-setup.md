# Cloudflare Access Self-Hosted application — full field reference

## Application object

Created via `cloudflare.zeroTrust.access.applications.create`.

| Field | Notes |
|---|---|
| `type` | Always `self_hosted` for wp-login. |
| `name` | Use `{ClientName} - WordPress Login` — obvious in a list. |
| `domain` | `<host>/<path>`. Path may be exact (`/wp-login.php`) or end in `*` for prefix match (`/wp-admin/*`). |
| `session_duration` | Go strings: `30m`, `6h`, `24h`, `720h`. Default `24h`. |
| `auto_redirect_to_identity` | Keep `false` for OTP-only. |
| `app_launcher_visible` | `false` for wp-login — it's a login page, not an SSO destination. |
| `allowed_idps` | Empty array = all configured IdPs. Leave empty for OTP-only. |
| `enable_binding_cookie` | Leave `false` — interacts weirdly with WP nonces. |
| `same_site_cookie_attribute` | Keep default `lax`. **Do not** set to `strict` — breaks the OTP redirect flow. |
| `logo_url` | Use the client's site logo URL for branding. |

## Policy object

```json
{
  "name": "Allow approved emails",
  "decision": "allow",
  "include": [
    { "email": { "email": "editor1@client.com" } },
    { "email_domain": { "domain": "refact.co" } }
  ],
  "exclude": [],
  "require": [],
  "session_duration": "24h"
}
```

Decision types:
- `allow` — user passes if they match `include` and aren't in `exclude`. Standard.
- `deny` — block outright. Use for explicit deny lists before allow.
- `bypass` — let through without authenticating. Only for narrowly scoped IPs (e.g., monitoring services).

### Include selector cheat sheet

| Selector | When to use |
|---|---|
| `email` | Single editor's email. Most common. |
| `email_domain` | Whole company (e.g., `refact.co`). Use for our team. Don't use for client domains unless tiny. |
| `ip` | CIDR list of office IPs. Combine with `email` to require both. |
| `country` | Geolocation. Useful for "US editors only". |

### Exclude selector

Anything in `exclude` overrides `include`:
```json
"exclude": [{ "email": { "email": "dev@refact.co" } }]
```

## Setting up the One-Time PIN IdP (once per account)

OTP is account-level. If the client account has never used Zero Trust, initialize the team first:

1. Dashboard → **Zero Trust** → pick a team name (becomes `{team-name}.cloudflareaccess.com`). Requires Super Admin.
2. **Settings → Authentication → Login methods → Add new → One-time PIN**.

```javascript
// Add OTP IdP via API:
await execute(async (cloudflare) => {
  return cloudflare.zeroTrust.identityProviders.create({
    account_id: "{{account_id}}",
    type: "onetimepin",
    name: "One-time PIN",
  });
});
```

There is no idempotent "create team" API — do the first-time team init in the dashboard.

## Updating the policy to add a new editor

```javascript
await execute(async (cloudflare) => {
  const policy = await cloudflare.zeroTrust.access.applications.policies.list({
    account_id: "{{account_id}}",
    app_id: "{{app_id}}",
  });
  const existing = policy.result[0];
  return cloudflare.zeroTrust.access.applications.policies.update({
    account_id: "{{account_id}}",
    app_id: "{{app_id}}",
    policy_id: existing.id,
    name: existing.name,
    decision: existing.decision,
    include: [
      ...existing.include,
      { email: { email: "neweditor@client.com" } },
    ],
  });
});
```
