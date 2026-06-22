# WordPress cookies and Cloudflare caching

WordPress sets several cookies. Some legitimately distinguish logged-in users (and should bust cache); others are set on anonymous visitors and incorrectly suppress caching. Knowing the difference is the difference between 21% and 85% cache hit rate.

## WordPress's own cookies

| Cookie | Set when | Should bust cache? |
|---|---|---|
| `wordpress_logged_in_<hash>` | User is logged in | **YES** — personalized content |
| `wordpress_sec_<hash>` | Secure version of above (HTTPS) | YES |
| `wordpress_test_cookie` | First page load to verify cookies work | **NO** — set on anonymous visitors; common mistake to bypass cache for this |
| `wp-settings-N` | WP admin preferences | YES (only set in admin) |
| `comment_author_*` | Commenter "remember me" | YES |
| `wp_woocommerce_session_<hash>` | WooCommerce visitor with cart | YES |
| `woocommerce_cart_hash`, `woocommerce_items_in_cart` | Visible cart state | YES |

## WP Engine's cache-busting cookies

WP Engine's origin cache bypasses for any cookie starting with: `wordpress_*`, `wp_*`, `wp-settings-*`, `comment_author_*`, `wp_woocommerce_session_*`, `wp-postpass_*`.

When WP Engine sees these cookies → bypasses origin cache → WP runs → response with `Cache-Control: private` → Cloudflare also bypasses cache → **BYPASS**.

The trouble is when **anonymous visitors** acquire cookies that look like logged-in cookies, triggering this chain unnecessarily.

## Common plugin culprits

| Plugin | Cookie it sets on anonymous visitors |
|---|---|
| OptinMonster / Popup Maker | `om_*`, `pm-*` — some also send `Cache-Control: private` |
| WPML / Polylang | `wp-wpml_current_language` |
| Klaviyo / HubSpot embed | `__kla_id`, `__hstc` — fragment cache key if cookie-keyed |
| Consent banners (Cookiebot, OneTrust) | Consent state cookies — can vary response if origin reads them |

Diagnostic: hit the page in a clean incognito session, check `Set-Cookie` response header. Anything unexpected = the plugin to investigate.

## Cache Rule that handles WP correctly

```javascript
await execute(async (cloudflare) => {
  const zone_id = "{{zone_id}}";
  const phase = await cloudflare.rulesets.phases.get({
    zone_id, ruleset_phase: "http_request_cache_settings",
  });
  return cloudflare.rulesets.rules.create({
    zone_id,
    ruleset_id: phase.result.id,
    action: "set_cache_settings",
    action_parameters: {
      cache: true,
      edge_ttl: {
        mode: "override_origin",
        default: 14400,
        status_code_ttl: [
          { status_code: 200, value: 14400 },
          { status_code: 301, value: 86400 },
          { status_code: 404, value: 600 },
        ],
      },
      browser_ttl: { mode: "override_origin", default: 3600 },
      cache_key: {
        ignore_query_strings_order: true,
        cache_by_device_type: false,
        custom_key: {
          query_string: {
            exclude: { list: ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "_ga", "fbclid", "gclid", "__hstc", "__hssc", "__hsfp"] },
          },
        },
      },
      respect_strong_etags: true,
      serve_stale: { disable_stale_while_updating: false },
    },
    expression: '(http.request.method eq "GET" and not (http.cookie contains "wordpress_logged_in_" or http.cookie contains "wp_woocommerce_session_" or starts_with(http.request.uri.path, "/wp-admin/") or http.request.uri.path eq "/wp-login.php" or starts_with(http.request.uri.path, "/wp-json/")))',
    description: "Cache HTML for anonymous visitors, bypass for logged-in / admin / API",
    enabled: true,
  });
});
```

## Critical rules

1. **Always exclude `wordpress_logged_in_`** — caching logged-in admin pages means editor A sees editor B's "Edit Post". This has happened on other agencies' watch; never on ours.
2. **Always exclude `/wp-json/`** — the REST API sometimes returns per-user content; caching it can leak data between users.
3. If a specific public `wp-json` endpoint needs caching (e.g., `/wp-json/wp/v2/posts`), write a **separate** rule for that exact path with a short TTL (60s).
