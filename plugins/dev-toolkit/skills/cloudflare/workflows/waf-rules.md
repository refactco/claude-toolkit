# Workflow: WAF Rules

Build Cloudflare WAF custom rules, IP Access Rules, and configure Bot Fight Mode for a client zone.

**When to use:** block an IP / CIDR / ASN / country / user-agent, restrict admin paths by geo, allowlist office IPs, or enable / tune Bot Fight Mode.

**Do NOT use for:** wp-login.php OTP (zero-trust-wp-login workflow), cache problems (cache-debug workflow), or DNS (dns-onboarding workflow).

**Conventions (see `../SKILL.md`):** Narration · MCP servers (`cloudflare-api`, `cloudflare-docs`, `cloudflare-graphql`) · Resolve the zone · Role check.

## Pick the right primitive

```
Block one IP / /24 for hours-days     → IP Access Rule  (fastest, no ruleset)
List of IPs / CIDRs / IPv6 prefixes   → Custom rule with ip.src in {...}
ASN / country / UA / path-scoped      → Custom rule
Office allowlist                      → Custom rule, action=skip, position first
Per-form spam                         → cf-turnstile-forms (not this workflow)
Bot signature blocking, broad         → Bot Fight Mode / Super Bot Fight Mode
```

## IP Access Rule (fastest path)

Use `firewall.accessRules.create` with `mode: "block"` (or `js_challenge | managed_challenge | challenge | whitelist`).

`configuration.target` options:
- `ip` — single IPv4
- `ip6` — single IPv6
- `ip_range` — CIDR
- `asn` — `AS12345`
- `country` — ISO code, e.g. `US`

Always set `notes` with date + reason + ticket ID for audit history.

## Custom rule (standard path)

1. Get the `http_request_firewall_custom` phase ruleset for the zone. If it returns 404, create one with `kind: "zone"`, empty rules.
2. **Always use `rulesets.rules.create` to append.** `rulesets.update` replaces the entire rule list — we have wiped a zone this way once.
3. Create with `action`, `expression`, `description`, `enabled: true`.

Example expression (geo-block excluding good bots):

```
(ip.geoip.country in {"CN" "RU" "KP"}) and not cf.client.bot
```

See `references/wordpress/waf-common-patterns.md` for copy-paste recipes.
See `references/wordpress/waf-expression-language.md` for the full field reference.

### Actions

| Action | When |
|---|---|
| `block` | Definitely malicious |
| `managed_challenge` | Mixed; **never on POST endpoints** (Cloudflare drops POST body after challenge) |
| `skip` | Allowlist past subsequent rules/phases |
| `log` | Enterprise only; tune before blocking |

### Office allowlist (skip, must be first)

A skip rule needs the full `action_parameters` payload, or it won't actually skip the right things:

- `ruleset: "current"`
- `phases: ["http_request_firewall_managed", "http_ratelimit"]`
- `products: ["bic", "hot", "rateLimit", "securityLevel", "uaBlock", "waf", "zoneLockdown"]`

Expression example: `ip.src in {203.0.113.0/24 198.51.100.7}`. Set `position: { index: 1 }` so it runs before any block rules.

See `references/wordpress/waf-skip-pattern.md` for why the full `action_parameters` is needed.

## Bot Fight Mode

- **Free / Pro:** `bots.botFightMode.update` with `fight_mode: true`.
- **Super Bot Fight Mode (Pro+):** `bots.superBotFightMode.zoneConfig.update`. Required on publisher zones:
  - `optimize_wordpress: true` (mandatory on WP zones)
  - `sbfm_definitely_automated: "managed_challenge"`
  - `sbfm_likely_automated: "managed_challenge"`
  - `sbfm_verified_bots: "allow"`
  - `sbfm_static_resource_protection: false`

See `references/wordpress/bot-fight-mode.md` for full enable/disable/exempt guidance.

## Verify

Pull firewall events from the last 15 min via `firewallEventsAdaptive` (filter `datetime_geq`, order by `datetime_DESC`, limit 50). Select `datetime, action, source, ruleId, clientIP, clientCountryName, clientRequestPath, userAgent`.

Confirm the rule fires on bad traffic and is not catching real users.

## References

- [`references/wordpress/waf-expression-language.md`](../references/wordpress/waf-expression-language.md) — full field list
- [`references/wordpress/waf-common-patterns.md`](../references/wordpress/waf-common-patterns.md) — copy-paste recipes
- [`references/wordpress/spam-bot-patterns.md`](../references/wordpress/spam-bot-patterns.md) — recurring spam patterns
- [`references/wordpress/waf-gotchas.md`](../references/wordpress/waf-gotchas.md) — update-replaces-all, regex escaping, phase precedence
- [`references/wordpress/bot-fight-mode.md`](../references/wordpress/bot-fight-mode.md) — Bot Fight Mode setup
- [`references/wordpress/waf-skip-pattern.md`](../references/wordpress/waf-skip-pattern.md) — office allowlist skip
