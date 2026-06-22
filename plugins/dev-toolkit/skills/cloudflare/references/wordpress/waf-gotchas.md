# WAF gotchas that have burned us

## `rulesets.update` replaces ALL rules in the phase

`cloudflare.rulesets.update({...rules: [...]})` replaces the entire rule list. If you pass `rules: [{my new rule}]`, every other rule in the ruleset is **deleted**.

For appending, use `cloudflare.rulesets.rules.create({...})`. For editing one rule, use `cloudflare.rulesets.rules.edit({...rule_id, ...changes})`.

We lost six existing rules on a CREDaily ticket this way. Never use the full-ruleset `update` to append.

## Phase execution order is fixed

```
1. http_request_firewall_custom    ← your rules, top-to-bottom
2. http_request_firewall_managed   ← Cloudflare's managed rulesets, BFM
3. http_ratelimit                  ← rate-limit rules
```

You cannot reorder phases. A custom rule with action `skip` can bypass later phases. This means:
- Office allowlist must be in the custom phase, action `skip`, with phases listed.
- A rate-limit rule never runs if a custom rule already blocked the request.

## Regex escaping

In the expression language, regex is double-escaped:

```text
# Correct: match .php at end of path
matches "\\.php$"

# Wrong: only one backslash — invalid in string context
matches "\.php$"
```

Test regex in the dashboard's expression builder before deploying via API.

## `cf.client.bot` is verified bots only

`cf.client.bot == true` means Cloudflare has **reverse-DNS verified** this as a real Googlebot/Bingbot/etc. It is NOT "anything that looks like a bot". For general bot scoring, use `cf.bot_management.score lt 30` (requires Bot Management subscription).

## `http.request.body.*` is not free

`http.request.body.full`, `.size`, `.form.*` only work on Business and Enterprise zones. On Free and Pro, the rule deploys without error but never matches.

## Country `XX` and `T1`

- `XX` — Unknown country (Cloudflare couldn't geolocate). Often Tor, anonymizer, new IP allocations. Blocking `XX` sometimes catches real users on new ISPs.
- `T1` — Tor exit nodes specifically.

## Bot Fight Mode + WP REST API

When BFM is on and `optimize_wordpress: false`, requests to `/wp-json/*` from Gutenberg in the admin can be challenged, causing "Updating failed" silently. Always set `optimize_wordpress: true` on publisher zones.

## Firewall event retention

- Free / Pro: 24h
- Business: 7 days
- Enterprise: 30 days

If a client says "we got spam two weeks ago" and they're on Pro, you cannot pull it from Cloudflare. Check plugin-side logs or WP Engine access logs (30 days).

## `firewall.accessRules` is legacy but still works

The old IP firewall endpoint. Still the **fastest** way to ban one IP — use it for emergency blocks. These rules show up under "Security → WAF → Tools → IP Access Rules", NOT in the custom-rules list. Always add `notes` so the next engineer knows why.

## Check audit log before changing anything

```javascript
// via cloudflare-audit-logs MCP
await search("audit log entries for ruleset changes in this zone in the last 90 days")
```

Before deleting or disabling a rule a previous engineer set up, check why. The audit log shows who changed it and when.
