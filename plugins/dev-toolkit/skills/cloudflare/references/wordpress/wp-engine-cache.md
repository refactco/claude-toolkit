# WP Engine ↔ Cloudflare cache-layer interaction

WP Engine has its own caching layer (Nginx-level page cache + optional Edge Full Page Cache via GES). When Cloudflare is in front, both layers compose — and they can fight.

## How the layers compose

```
Visitor
  ↓
Cloudflare cache (our zone, or GES, or both)
  ↓ if MISS
WP Engine Edge Full Page Cache (if GES + EFPC enabled)
  ↓ if MISS
WP Engine Nginx Page Cache
  ↓ if MISS
PHP / WordPress
```

## WP Engine's default Cache-Control behavior

| Condition | WP Engine sends |
|---|---|
| Anonymous visitor, no busting cookies | `Cache-Control: max-age=600, public` (10 minutes) |
| Cookie indicating logged-in user | `Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0` |
| Admin or AJAX endpoints | `Cache-Control: no-cache, must-revalidate, max-age=0` |
| Static assets | `Cache-Control: public, max-age=31536000, immutable` |

The 10-minute default is **the** common reason WordPress publisher sites on WP Engine have low Cloudflare cache hit rates: the cache is correctly populated, but evicts every 10 minutes.

## The fix: override origin TTL for HTML

```javascript
action_parameters: {
  cache: true,
  edge_ttl: {
    mode: "override_origin",   // key — without this, origin's max-age=600 wins
    default: 14400,            // 4h
  },
  browser_ttl: {
    mode: "override_origin",
    default: 600,              // browser still revalidates every 10m
  },
}
```

TTL guidance by publication frequency:
- Hourly / breaking news → 600–1800
- Multiple times a day → 3600–7200
- Once a day or less → 14400–86400

## Cache purging

For aggressive edge_ttl rules (4h+) to be safe, purging must be set up. Otherwise editors publish and don't see updates for hours.

```javascript
// Purge specific URLs (after publish)
await execute(async (cloudflare) => {
  return cloudflare.cache.purge({
    zone_id: "{{zone_id}}",
    files: [
      "https://example.com/some-article/",
      "https://example.com/",
    ],
  });
});

// Purge everything (use sparingly)
await execute(async (cloudflare) => {
  return cloudflare.cache.purge({
    zone_id: "{{zone_id}}",
    purge_everything: true,
  });
});
```

Integration options:
- WP Engine Cloudflare integration plugin — automatic purge on publish
- Cloudflare's official WP plugin — adds a purge button in the admin
- API purge via `cloudflare-api` MCP (code above)

## The double-cache problem with GES

When the client is on GES, traffic flows through WP Engine's Cloudflare account, not ours. Our zone's TTL settings don't affect performance. See `wp-engine-ges-access.md` for the full GES picture.

To see the actual cache state: check `X-Wpengine-Cache` header from curl. The `cf-cache-status:` you see comes from GES's Cloudflare zone, not ours.

## WP Engine Page Rule conflicts

WP Engine sometimes deploys their own rules on the GES Cloudflare (different account — not visible in our dashboard). When headers don't match what your rule should produce, open a WP Engine ticket.
