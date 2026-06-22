# WAF copy-paste recipes

Real, tested rules for the scenarios we hit weekly.

## Block one IP, one ASN, or one country

```text
# Single IP
(ip.src eq 203.0.113.42)

# Multiple IPs / CIDRs in one rule
(ip.src in {203.0.113.42 198.51.100.0/24 2001:db8::/32})

# Country block — spare verified bots (Google, Bing, etc.)
(ip.geoip.country in {"CN" "RU" "KP"}) and not cf.client.bot

# Block an ASN (DigitalOcean = 14061, Hetzner = 24940 — popular for scrapers)
(ip.geoip.asnum in {14061 24940})

# Block unknown / anonymizer geographies
(ip.geoip.country in {"XX" "T1"})  // XX = unknown, T1 = Tor
```

Action: `block`.

## Block a scanner by user-agent

```text
(lower(http.user_agent) contains "sqlmap") or
(lower(http.user_agent) contains "nikto") or
(lower(http.user_agent) contains "acunetix") or
(lower(http.user_agent) contains "nessus") or
(lower(http.user_agent) contains "wpscan")
```

## Geo-restrict an admin path (US only)

```text
(starts_with(http.request.uri.path, "/wp-admin/") and
 http.request.uri.path ne "/wp-admin/admin-ajax.php" and
 ip.geoip.country ne "US")
or
(http.request.uri.path eq "/wp-login.php" and ip.geoip.country ne "US")
```

**Must exclude `admin-ajax.php`** — it's hit by logged-out visitors for forms, mini-cart, etc. See `wp-admin-paths.md`.

Action: `block`. Never `managed_challenge` on the POST of wp-login.php — see `managed-challenge-post-trap.md`.

## Block xmlrpc.php

```text
(http.request.uri.path eq "/xmlrpc.php")
```

Action: `block`. **Only if** the client doesn't use Jetpack, WP mobile app, or any xmlrpc integration. If they do, rate-limit instead.

## Rate-limit xmlrpc.php

```javascript
// In the http_ratelimit phase:
ratelimit: {
  characteristics: ["ip.src", "cf.colo.id"],
  period: 60,
  requests_per_period: 5,
  mitigation_timeout: 600,
}
expression: 'http.request.uri.path eq "/xmlrpc.php"'
```

## Rate-limit wp-login.php (when not using Access)

```javascript
ratelimit: {
  characteristics: ["ip.src", "cf.colo.id"],
  period: 60,
  requests_per_period: 5,
  mitigation_timeout: 3600,
}
expression: '(http.request.uri.path eq "/wp-login.php" and http.request.method eq "POST")'
```

Scope to `method eq "POST"` — don't rate-limit visitors loading the page, only those submitting credentials.

## Block dotfiles / env / git

```text
(http.request.uri.path matches "^/(\\.env|\\.git/|\\.htaccess|wp-config\\.php(\\.bak)?$)")
```

Action: `block`.

## Block AI crawler bots (without breaking Google)

```text
(lower(http.user_agent) contains "gptbot") or
(lower(http.user_agent) contains "claudebot") or
(lower(http.user_agent) contains "perplexitybot") or
(lower(http.user_agent) contains "ccbot") or
(lower(http.user_agent) contains "anthropic-ai") or
(lower(http.user_agent) contains "google-extended")
```

Block Googlebot impostors while leaving real Googlebot alone:

```text
(lower(http.user_agent) contains "googlebot") and not cf.client.bot
```

## Allowlist office IPs

```text
(ip.src in {203.0.113.0/24 198.51.100.7})
```

Action: `skip`. See `waf-skip-pattern.md` for the full `action_parameters`.
