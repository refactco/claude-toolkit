# Workflow: Site Triage

Diagnose why a site is down, flapping, or slow. Analyze traffic to identify the bottleneck, then take the appropriate action.

**When to use:**
- "The site is down"
- "The site keeps going up and down"
- "The site is slow / TTFB is high"
- "Origin CPU is spiking"
- "We're getting flooded"

**What this workflow does:** pulls traffic data from Cloudflare's GraphQL analytics, identifies the pattern, finds the culprit (specific IPs / ASNs / user-agents / paths / countries), then applies the right fix.

**Conventions (see `../SKILL.md`):** Narration · MCP servers (`cloudflare-api`, `cloudflare-graphql`, `cloudflare-audit-logs`) · Resolve the zone · Role check.

---

## Phase 0 — MCP precheck (mandatory, do this first)

Before any triage step, confirm the `mcp__cloudflare_*` tools are loaded in your session. If they are not:

1. Follow **SKILL.md § Installing MCP Servers** for your host (Cursor or Claude Code) to install + authenticate the required servers.
2. **Do not** check `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_EMAIL` or any other env var as a shortcut.
3. **Do not** call the Cloudflare REST API via `curl` (or any HTTP client / CLI) to substitute for missing MCP tools.
4. If install requires user action (OAuth, restart), stop and hand off. Resume only after MCP tools appear in your tool list.

There is no read-only fallback. Skip this precheck and you will produce wrong or empty answers.

---

## Phase 1 — Establish the zone and time window

Resolve the zone using the snippet in SKILL.md § Resolve the zone. Then pick a time window:
- **Last 15 minutes** for an active incident ("site is down right now").
- **Last 1 hour / 6 hours** for intermittent issues ("it was flapping earlier").
- **Last 24 hours** for trend analysis ("our origin CPU has been high all day").

---

## Phase 2 — Get the traffic picture

All Phase 2 queries hit `viewer.zones(filter: { zoneTag })` and either `httpRequestsAdaptiveGroups` or `firewallEventsAdaptiveGroups` with `filter: { datetime_geq: $since }`. Only the body (aggregates + dimensions), `orderBy`, and `limit` change. Run only the rows relevant to the symptom.

| # | Signal | Node | orderBy | limit | Body (aggregates + dimensions) | Why |
|---|---|---|---|---|---|---|
| 2a | Status codes | `httpRequestsAdaptiveGroups` | `count_DESC` | 20 | `count, sum { edgeResponseBytes }, dimensions { edgeResponseStatus cacheStatus }` | 5xx=origin, 4xx=scan, 2xx flood=DDoS/crawler |
| 2b | Country | `httpRequestsAdaptiveGroups` | `count_DESC` | 20 | `count, dimensions { clientCountryName }` | Geo concentration |
| 2c | User-agent | `httpRequestsAdaptiveGroups` | `count_DESC` | 20 | `count, dimensions { userAgent }` | Scanner / crawler / bot floods |
| 2d | Source IP | `httpRequestsAdaptiveGroups` | `count_DESC` | 50 | `count, dimensions { clientIP }` | Few IPs doing big volume |
| 2e | Path | `httpRequestsAdaptiveGroups` | `count_DESC` | 30 | `count, dimensions { clientRequestPath edgeResponseStatus }` | Hammered URLs (wp-login, /.env, /xmlrpc.php) |
| 2f | Firewall events | `firewallEventsAdaptiveGroups` | `count_DESC` | 30 | `count, dimensions { action source ruleId clientCountryName clientIP userAgent clientRequestPath }` | What WAF is catching |
| 2g | Origin TTFB | `httpRequestsAdaptiveGroups` | `avg_edgeTtfbMs_DESC` | 20 | `count, avg { edgeTtfbMs originTtfbMs }, dimensions { clientRequestPath cacheStatus }` | High-TTFB paths (cache or origin) |

---

## Phase 3 — Identify the pattern

Read the data from Phase 2 and match to a pattern. Run only the sub-steps relevant to the symptom.

### Pattern A — Traffic flood / DDoS

**Signals:** request count is 10x–100x normal, mostly 2xx or hitting origin.

Drill into countries / ASNs / UAs together — change the Phase 2 body to:
`count, dimensions { clientASNDescription clientCountryName userAgent }`, `orderBy: [count_DESC]`, `limit: 30`.

**Findings to look for:**
- Single country accounts for >50% of traffic → geo-block candidate.
- Single ASN (cloud provider, VPN) dominates → ASN block or managed-challenge.
- User-agent is consistent across the flood → UA block.
- Many unique IPs, spread UA → volumetric DDoS — enable SBFM, check DDoS settings.

### Pattern B — Scanner / brute-force

**Signals:** spike in 4xx (especially 401, 403, 404), requests concentrated on `/wp-login.php`, `/.env`, `/xmlrpc.php`, `/.git/`, `wp-config.php`.

The path breakdown from 2e will show a small number of paths with very high counts.

**Actions:** block the path(s), rate-limit, or block the source IP/ASN if concentrated.

### Pattern C — AI crawler / scraper wave

**Signals:** high request volume, mostly GET, hitting many different archive / category / paginated URLs, cache hit rate is low or dropping, many 200s but origin CPU is rising.

User-agent breakdown from 2c will show crawler-like UAs (GPTBot, ClaudeBot, CCBot, AhrefsBot, SemrushBot, etc.).

**Actions:** block specific AI crawlers (waf-rules workflow), aggressive caching of archive pages (cache-debug workflow).

### Pattern D — Origin overload (not attack-driven)

**Signals:** high origin TTFB from 2g, 5xx responses, cache BYPASS or DYNAMIC on most requests.

The site is getting hammered but the requests look legitimate — no UA concentration, geographically spread.

**Root cause:** probably cache not working (every request hits origin). Fix is cache-debug workflow first, THEN see if the 5xx clears.

### Pattern E — Flapping (intermittent down)

**Signals:** 5xx rate spikes every few minutes / hours, then recovers.

Drill into 1-minute granularity over the last 3h with `httpRequests1mGroups`, ordered `datetime_ASC`, limit 180. Body: `dimensions { datetime }, sum { requests }, ratio { status5xx }`.

Look for: periodic spikes (cron job hammering origin), spikes that correlate with specific hours (content publication, scheduled crawls), or random spikes (bot waves).

---

## Phase 4 — Execute the fix

Based on the pattern found, run the appropriate action. Link to the right workflow for full context.

### Fix A1 — Block a specific IP immediately (fastest)

`firewall.accessRules.create` with `mode: "block"`, `configuration: { target: "ip", value: "{{bad_ip}}" }`, and `notes` capturing date + reason. (Details: see waf-rules workflow.)

### Fix A2 — Block a country or ASN

Custom rule in `http_request_firewall_custom` (create the phase ruleset if 404). Use `rulesets.rules.create` to **append** — never `rulesets.update`, it replaces.

Expressions:
- Country: `(ip.geoip.country in {"CN" "RU"}) and not cf.client.bot`
- ASN: `(ip.geoip.asnum in {14061 24940}) and not cf.client.bot`

### Fix A3 — Block a specific user-agent

Custom rule, action `block`, expression: `(lower(http.user_agent) contains "{{bad_ua_fragment}}")`.

### Fix A4 — Rate-limit a specific path

Append to the `http_ratelimit` phase. Required `ratelimit` block:

```
characteristics: ["ip.src", "cf.colo.id"]
period: 60
requests_per_period: 10
mitigation_timeout: 600
```

Expression: `http.request.uri.path eq "{{hammered_path}}"`, action `block`.

### Fix B — Enable Super Bot Fight Mode (for broad automated traffic)

See `references/wordpress/bot-fight-mode.md`.

### Fix C — Cache archive pages aggressively (for crawler-driven origin CPU)

See `workflows/cache-debug.md` — specifically step 3b (DYNAMIC) and the 404-caching pattern.

### Fix D — Protect wp-login.php from brute-force

See `workflows/zero-trust-wp-login.md`.

---

## Phase 5 — Verify the fix

After applying any fix, re-run the relevant Phase 2 queries with a 5-minute window and confirm:
- Request rate dropped (for floods) — query 2a, dimensions `{ edgeResponseStatus }`
- 5xx rate dropped (for origin overload) — query 2a
- Firewall events show the new rule is firing on bad traffic — query 2f
- Real user traffic is not being caught — cross-check 2f's `clientIP` / `clientCountryName` against your office allowlist

---

## Triage decision table

| Symptom | First query | Pattern | Fix |
|---|---|---|---|
| Site totally down | 2a (status codes) | 5xx spike + BYPASS = origin dead | Fix origin; enable cache stale-while-revalidate |
| Site down, traffic 10x normal | 2b + 2c + 2d | Country/UA concentration | Block country / ASN / UA (Fix A2/A3) |
| Site flapping every hour | 2g (TTFB) + flapping query | Origin CPU spiking | Cache-debug workflow → fix DYNAMIC/BYPASS |
| High 4xx on /wp-login.php | 2e (by path) | Brute-force | zero-trust-wp-login workflow |
| Slow TTFB but no errors | 2g (origin TTFB) + 2a (BYPASS) | Cache not working | Cache-debug workflow |
| AI crawlers, low cache hit rate | 2c (UA) | Crawler wave | Block crawlers (waf-rules) + cache archives (cache-debug) |
| Scanner probing /.env, /wp-config | 2e (by path) | Vuln scanner | Block paths + IP (Fix A1 + Fix A3) |

---

## References

- [`references/wordpress/waf-common-patterns.md`](../references/wordpress/waf-common-patterns.md) — block patterns for common attack types
- [`references/wordpress/spam-bot-patterns.md`](../references/wordpress/spam-bot-patterns.md) — known recurring attacker signatures
- [`references/wordpress/bot-fight-mode.md`](../references/wordpress/bot-fight-mode.md) — enable BFM for broad automated traffic
- [`references/wordpress/waf-gotchas.md`](../references/wordpress/waf-gotchas.md) — update-replaces-all, phase order, plan limits
- [`workflows/cache-debug.md`](./cache-debug.md) — fix caching when origin CPU is the real bottleneck
- [`workflows/waf-rules.md`](./waf-rules.md) — full WAF rule workflow
- [`workflows/zero-trust-wp-login.md`](./zero-trust-wp-login.md) — protect wp-login from brute-force
