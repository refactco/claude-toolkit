# WP Engine Global Edge Security (GES) and Cloudflare Access — the conflict

This is the single most common reason a Refact-deployed Access app appears not to work. We have hit it on SLM and adjacent clients.

## What GES does

GES is WP Engine's paid Cloudflare integration. When enabled, WP Engine puts **their own Cloudflare zone** in front of the customer's origin. The customer's domain is CNAMEd to a hostname under `wpeproxy.com`, which resolves into WP Engine's Cloudflare account — an account the customer cannot see or edit.

## Why it conflicts with our Access app

When the visitor hits `example.com/wp-login.php`:
```
Browser
  → DNS lookup example.com
  → CNAME to abc123.wpeproxy.com
  → resolves to WP Engine's Cloudflare account
  → WP Engine's CF runs THEIR WAF, THEIR caching, THEIR SSL
  → forwards to WP Engine origin
```

The **client's** Cloudflare account (where our Access app lives) is not in this path at all. Our Access app is sitting on a zone that no real traffic touches.

## How to detect GES

```javascript
await execute(async (cloudflare) => {
  const zones = await cloudflare.zones.list({ name: "{{client_domain}}" });
  if (zones.result.length === 0) return { state: "no-zone" };
  const zone = zones.result[0];
  const records = await cloudflare.dns.records.list({ zone_id: zone.id, per_page: 200 });
  const ges_records = records.result.filter(r =>
    (r.content || "").match(/wpeproxy\.com|wpengine\.com|wpenginepowered\.com/i)
  );
  return {
    state: ges_records.length > 0 ? "ges-detected" : "no-ges",
    ges_records,
    zone_id: zone.id,
  };
});
```

Or from outside Cloudflare:
```bash
dig +short www.example.com CNAME
# wpeproxy.com → GES is on
```

## Decision tree

```
Is the apex (or www) CNAME pointing at wpeproxy.com?
├─ Yes → GES is active. Three options:
│  ├─ A) Measure first: pull /wp-login.php traffic from graphql MCP.
│  │     If volume is already low and challenge rate is handled by GES,
│  │     there's nothing to do. This is the right default.
│  │
│  ├─ B) Disable GES. Client opens a WP Engine ticket. Once GES is off,
│  │     the apex DNS needs an A record at the WP Engine origin IP.
│  │     Our Access app starts working immediately.
│  │
│  └─ C) Coordinate with WP Engine to deploy on their account.
│        Slow, ticket-per-change. Only for enterprise clients.
│
└─ No → Proceed with zero-trust-wp-login workflow.
```

Default to option A — measure before changing. Most "login is under attack" complaints turn out to be 30 requests/day, all handled by GES, and disrupting GES is not something the client actually wants.

## What to tell the client when option B is chosen

> Hey {client}, we found that your site is on WP Engine's Global Edge Security (GES), which means WP Engine runs their own Cloudflare layer in front of your origin. To put our Access policy on /wp-login.php we need GES disabled for {domain}. Could you open a ticket with WP Engine asking them to disable GES on {domain} only? Once they confirm, we'll cut over the apex DNS and turn on Access. Total downtime should be a few minutes; we'll schedule it.

## Audit-log evidence

To prove to the client that the Access app is not seeing traffic, query the audit-logs MCP for `access.application` events and pull the request count from `cloudflare-graphql` filtered on `clientRequestPath = "/wp-login.php"`. Both will be empty when GES is intercepting — that's the smoking gun.
