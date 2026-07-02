# Cache Rules — field reference

Cache Rules live in the `http_request_cache_settings` phase of the Ruleset Engine. They're the canonical way to control caching as of 2024 (replacing the older "Page Rules" — Page Rules still work but Cache Rules have richer config and per-rule action_parameters).

## Phase

| Phase | Purpose |
|---|---|
| `http_request_cache_settings` | Decide caching behavior per request |
| `http_request_transform` | Modify URL / headers (use for stripping params *before* the cache key is computed) |
| `http_response_transform` | Modify response headers (e.g., add Cache-Control downstream) |

For most cache work, `http_request_cache_settings` is enough.

## Action

Always `set_cache_settings`. The interesting part is `action_parameters`.

## action_parameters shape

```javascript
{
  cache: true,                // or false — turn caching on/off explicitly
  edge_ttl: {
    mode: "override_origin",  // or "respect_origin" or "bypass_by_default"
    default: 14400,
    status_code_ttl: [
      { status_code: 200, value: 14400 },
      { status_code: 404, value: 600 },
      { status_code_range: { from: 500, to: 599 }, value: 30 },
    ],
  },
  browser_ttl: {
    mode: "override_origin",  // or "respect_origin" or "bypass"
    default: 3600,
  },
  cache_key: {
    cache_by_device_type: false,
    cache_deception_armor: false,
    ignore_query_strings_order: true,
    custom_key: {
      query_string: {
        include: { list: ["page", "section"] },     // ONLY these params in key
        // OR
        exclude: { list: ["utm_*", "_hstc"] },      // strip these
        // OR
        // exclude: { all: true } — strip ALL query strings
      },
      header: {
        include: ["X-User-Tier"],
        check_presence: ["X-Mobile"],
        exclude_origin: true,
      },
      cookie: {
        include: ["session_tier"],
        check_presence: ["language"],
      },
      user: {
        device_type: true,
        geo: false,
        lang: false,
      },
      host: {
        resolved: true,
      },
    },
  },
  respect_strong_etags: true,
  origin_cache_control: false,
  origin_error_page_passthru: false,
  read_timeout: 30,
  serve_stale: {
    disable_stale_while_updating: false,
  },
  additional_cacheable_ports: [8080],
}
```

## Mode of edge_ttl: which one to use

| `mode` | Behavior |
|---|---|
| `override_origin` | Cloudflare's TTL wins. Origin's Cache-Control is ignored. **Use when origin sends bad headers** (`private`, `no-cache`) but you've decided the content is cacheable. |
| `respect_origin` | Cloudflare uses origin's Cache-Control. If origin says don't cache, Cloudflare doesn't cache. |
| `bypass_by_default` | Don't cache at all. |

Most fixes are `override_origin` because the root problem is usually "origin is sending wrong Cache-Control".

## Edge TTL by status code

```javascript
status_code_ttl: [
  { status_code: 200, value: 14400 },          // 4h for OK
  { status_code: 301, value: 86400 },          // 1d for permanent redirects
  { status_code: 302, value: 60 },             // 1m for temp redirects
  { status_code: 404, value: 600 },            // 10m for not found
  { status_code_range: { from: 500, to: 599 }, value: 0 },  // Don't cache server errors
]
```

Caching 404s is one of the cheapest wins on a content-heavy site — Googlebot hammering 404 archive pages costs one PHP cycle per request without this.

## Common Cache Rule patterns

### "Cache all HTML for anonymous visitors"

The default WordPress publisher rule. See `wordpress-cookies.md` for the full example.

### "Cache static assets for a year"

Already the default in Cloudflare — `.css`, `.js`, `.png`, etc. are cached by extension. But if origin sends `Cache-Control: no-cache` for assets (some misconfigured WP setups), override:

```javascript
action_parameters: {
  cache: true,
  edge_ttl: { mode: "override_origin", default: 31536000 },
  browser_ttl: { mode: "override_origin", default: 31536000 },
}
expression: '(http.request.uri.path matches "\\.(css|js|woff2?|ttf|otf|eot|jpg|jpeg|png|gif|webp|svg|ico)$")'
```

### "Strip tracking params from key"

See `tracking-params.md`.

### "Cache 404s aggressively to absorb crawler load"

```javascript
action_parameters: {
  cache: true,
  edge_ttl: {
    mode: "override_origin",
    default: 14400,
    status_code_ttl: [
      { status_code: 200, value: 14400 },
      { status_code: 404, value: 7200 },
    ],
  },
}
expression: '(http.request.method eq "GET" and not http.cookie contains "wordpress_logged_in_")'
```

### "Bypass cache for specific path"

```javascript
action_parameters: {
  cache: false,
}
expression: '(starts_with(http.request.uri.path, "/api/private/") or http.request.uri.path eq "/checkout/")'
```

## Rule order

Custom cache rules execute in order — first match wins. Always put your most specific rules first.

```javascript
position: { index: 1 }  // top of phase
// or
position: { before: "{{rule_id}}" }
```

## Verify the rule applied

```javascript
await execute(async (cloudflare) => {
  const zone_id = "{{zone_id}}";
  const phase = await cloudflare.rulesets.phases.get({
    zone_id, ruleset_phase: "http_request_cache_settings",
  });
  return phase.result.rules.map(r => ({
    id: r.id,
    description: r.description,
    expression: r.expression,
    action: r.action,
    enabled: r.enabled,
    action_parameters: r.action_parameters,
  }));
});
```
