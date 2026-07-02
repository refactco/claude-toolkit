# Protecting paths beyond /wp-login.php

Default: protect *only* `/wp-login.php`. The reasons to add more are narrow.

## Why /wp-admin is dangerous to blanket-protect

A live WordPress site uses `/wp-admin/admin-ajax.php` and `/wp-json/...` to serve **public** features:

| Path | Caller |
|---|---|
| `/wp-admin/admin-ajax.php` | Front-end Gravity Forms, WooCommerce mini-cart, infinite-scroll loaders. **Hit by logged-out visitors.** |
| `/wp-json/wp/v2/...` | Gutenberg preview, headless front-ends, analytics plugins. **Hit by logged-out visitors.** |
| `/wp-admin/post.php`, `/wp-admin/edit.php` | Actual admin pages — humans only. Safe to protect. |
| `/wp-admin/css/`, `/wp-admin/js/` | Static assets for the admin UI — browser loads them after login. Block these and admin loads as unstyled HTML. |

If you put an Access app on `/wp-admin/*` without exclusions, the homepage breaks.

## Safe pattern: two apps with bypass

**App 1 — wp-login** (entry point):
- `domain`: `{{client_domain}}/wp-login.php`

**App 2 — wp-admin** (post-login pages):
- `domain`: `{{client_domain}}/wp-admin/*`
- Plus bypass apps for public AJAX and REST API:

```javascript
await execute(async (cloudflare) => {
  const account_id = "{{account_id}}";
  // First: higher-priority bypass for public endpoints
  await cloudflare.zeroTrust.access.applications.create({
    account_id,
    type: "self_hosted",
    name: "Public admin-ajax bypass",
    domain: `${client_domain}/wp-admin/admin-ajax.php`,
    session_duration: "24h",
    policies: [{ name: "Public", decision: "bypass", include: [{ everyone: {} }] }],
  });
  await cloudflare.zeroTrust.access.applications.create({
    account_id,
    type: "self_hosted",
    name: "Public wp-json bypass",
    domain: `${client_domain}/wp-json/*`,
    session_duration: "24h",
    policies: [{ name: "Public", decision: "bypass", include: [{ everyone: {} }] }],
  });
  // Then: the broad wp-admin protection (exact-path bypass wins over wildcard)
  await cloudflare.zeroTrust.access.applications.create({
    account_id,
    type: "self_hosted",
    name: `${client_name} - WP Admin`,
    domain: `${client_domain}/wp-admin/*`,
    session_duration: "24h",
    policies: [{
      name: "Allow editors",
      decision: "allow",
      include: [
        { email: { email: "editor1@client.com" } },
        { email_domain: { domain: "refact.co" } },
      ],
    }],
  });
});
```

## What NOT to protect

- `/wp-content/uploads/*` — media. Block and the whole site goes white.
- `/feed/`, `/wp-rss.php` — RSS readers don't have email accounts.
- `/sitemap.xml`, `/robots.txt` — crawlers. Tanks SEO.
- `/wp-cron.php` — WordPress cron. Protecting it breaks scheduled posts.

## Path precedence

Cloudflare Access uses **path specificity** to resolve overlapping apps. An exact-path bypass beats a wildcard allow. This composes correctly:

```
/wp-admin/admin-ajax.php  → bypass (public)
/wp-admin/*               → allow approved emails
/wp-login.php             → allow approved emails
```

## Don't protect xmlrpc.php with Access

Jetpack and the WP mobile app fail when there's an interactive challenge in front. Use a WAF rate-limit instead.
