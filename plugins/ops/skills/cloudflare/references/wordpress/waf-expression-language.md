# Cloudflare Rules Language — field & operator reference

The syntax inside `expression` fields of custom rules, rate-limiting rules, and Cache Rules.

## Operators

| Operator | Example | Notes |
|---|---|---|
| `eq`, `ne` | `http.request.method eq "POST"` | Strings must be quoted. |
| `lt`, `le`, `gt`, `ge` | `cf.threat_score gt 30` | Integers only. |
| `in` | `ip.geoip.country in {"CN" "RU"}` | Space-separated, **not comma-separated**. |
| `contains` | `http.user_agent contains "curl"` | Case-sensitive substring. Wrap with `lower(...)` if needed. |
| `matches` | `http.request.uri.path matches "\\.php$"` | PCRE regex. Double-escape backslashes. |
| `and`, `or`, `not` | `(ip.src in {...}) and not cf.client.bot` | Use parens to be explicit. |

## Fields by category

### IP / network

| Field | Example | Notes |
|---|---|---|
| `ip.src` | `ip.src in {203.0.113.0/24}` | CIDR allowed in set. |
| `ip.geoip.country` | `ip.geoip.country eq "US"` | 2-letter code. `XX` = unknown. `T1` = Tor. |
| `ip.geoip.asnum` | `ip.geoip.asnum in {12345}` | ASN as integer (no `AS` prefix). |
| `ip.geoip.is_in_european_union` | | Bool. True for EU IPs. |

### HTTP request

| Field | Example |
|---|---|
| `http.host` | `http.host eq "shop.example.com"` |
| `http.request.method` | `http.request.method in {"POST" "PUT"}` |
| `http.request.uri.path` | `http.request.uri.path eq "/wp-login.php"` |
| `http.request.uri.query` | `http.request.uri.query contains "id="` |
| `http.user_agent` | `lower(http.user_agent) contains "sqlmap"` |
| `http.referer` | `not http.referer matches "^https?://example\\.com"` |
| `http.cookie` | `http.cookie contains "wordpress_logged_in_"` |
| `http.request.body.size` | `http.request.body.size gt 100000` |

### Cloudflare-derived fields

| Field | Notes |
|---|---|
| `cf.client.bot` | True for **verified** good bots only (Google, Bing). NOT "anything that looks like a bot". |
| `cf.threat_score` | Legacy threat score. 0–100; ≥10 suspicious. |
| `cf.bot_management.score` | 1=definitely bot, 99=definitely human. Requires Bot Management subscription. |

### Functions

| Function | Example |
|---|---|
| `lower(s)` | `lower(http.user_agent) contains "sqlmap"` |
| `len(s)` | `len(http.request.uri.path) gt 200` |
| `starts_with(s, prefix)` | `starts_with(http.request.uri.path, "/api/")` |
| `ends_with(s, suffix)` | `ends_with(http.request.uri.path, ".php")` |
| `url_decode(s)` | `url_decode(http.request.uri.query) contains "<script>"` |

## Plan-tier expression limits

| Capability | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Custom rules per zone | 5 | 20 | 100 | 1000 |
| Rate-limit rules per zone | 1 | 15 | 100 | 1000 |
| Use `http.request.body.*` | no | no | yes | yes |
| Use `cf.bot_management.score` | no | no | no | yes (subscription) |

Check the client's plan first via `cloudflare.zones.list().result[0].plan.name` before designing rules that require features above their tier.
