# Cf-Cache-Status values — what each one means and why you got it

`Cf-Cache-Status` is the header Cloudflare adds to every response. The value tells you what the cache layer did.

## Full value list

### HIT
Served from Cloudflare's cache without contacting origin. No action needed unless `age:` is suspiciously short.

### MISS
Not in cache; Cloudflare fetched from origin and (if cacheable) stored it. Normal on first request — subsequent identical requests should be HIT. If they're not, the cache key is fragmenting.

### EXPIRED
The cached response existed but its TTL had elapsed; Cloudflare fetched a fresh copy. Normal. To reduce, extend `edge_ttl` in a Cache Rule.

### REVALIDATED
Past TTL, Cloudflare asked origin "still valid?" with If-Modified-Since / If-None-Match, origin said yes (304). Great state — minimal origin compute.

### UPDATING
Served the cached version while asynchronously fetching fresh copy. Stale-while-revalidate behavior. Healthy.

### STALE
Past TTL and origin was unreachable / returned 5xx. Served stale to keep the site up. Investigate origin.

### BYPASS
Origin sent a header telling Cloudflare not to cache:
- `Cache-Control: no-cache`
- `Cache-Control: no-store`
- `Cache-Control: private`
- `Cache-Control: max-age=0`

The page is hitting origin on every request. See `workflow: cache-debug`, step 3a.

### DYNAMIC
Cloudflare decided the response isn't eligible for caching by default. On Free/Pro/Business plans, that includes most HTML pages (default cache only covers static-asset extensions).

This surprises clients: "but we have Cloudflare; why aren't pages cached?" Answer: HTML isn't cached by default — you need a Cache Rule.

### NONE / UNKNOWN
Cloudflare generated this response (Workers, WAF block, custom error page, redirect). Never reached origin and never cached. Check firewall events / redirect rules.

### IGNORED
Origin set a Cache-Control that explicitly disallows caching and Cloudflare honored it. Treat like BYPASS.

## How to read combinations of headers

| Cf-Cache-Status | Cache-Control (origin) | What it means |
|---|---|---|
| HIT | `max-age=3600` | Working as intended |
| MISS → MISS → MISS | `max-age=3600` | Cache key is fragmenting — check `vary:` and query strings |
| DYNAMIC | `max-age=3600` | Cloudflare didn't try to cache; need a Cache Rule with `cache: true` |
| BYPASS | `private` or `no-cache` | Origin tells Cloudflare not to cache; fix origin OR override with Cache Rule `edge_ttl.mode: "override_origin"` |
| HIT | `private` | A Cache Rule overrode origin — verify this is intentional |
| EXPIRED → chain | `max-age=60` | TTL too short; extend with Cache Rule |
