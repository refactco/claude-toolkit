# Bot Fight Mode — enable, tune, troubleshoot

## What it does

Bot Fight Mode (BFM) scores every request; if "definitely automated", the request gets a managed challenge / block. The free version is binary on/off and only catches "definitely-bot" traffic. Super Bot Fight Mode (Pro+) adds knobs for "likely-bot" traffic.

## When to enable

| Signal | Enable BFM? |
|---|---|
| Unexplained traffic growth, can't pin to specific IPs | Yes |
| WordPress site with normal traffic patterns | Yes, with `optimize_wordpress: true` |
| Specific known bad IPs / ASNs already identified | Just block them — BFM is overkill |
| Site that serves RSS readers / federated services / podcatchers | No — BFM will challenge them and break feeds |
| Site behind WP Engine GES | No — GES already includes equivalent |
| Client serves an API at this hostname | No — BFM will challenge legitimate machine clients |

## Enable

```javascript
// Free / Pro: Bot Fight Mode (binary)
await execute(async (cloudflare) => {
  return cloudflare.bots.botFightMode.update({
    zone_id: "{{zone_id}}",
    fight_mode: true,
  });
});

// Pro+: Super Bot Fight Mode (tunable)
await execute(async (cloudflare) => {
  return cloudflare.bots.superBotFightMode.zoneConfig.update({
    zone_id: "{{zone_id}}",
    fight_mode: true,
    optimize_wordpress: true,           // REQUIRED on publisher zones
    sbfm_definitely_automated: "managed_challenge",
    sbfm_likely_automated: "managed_challenge",
    sbfm_verified_bots: "allow",
    sbfm_static_resource_protection: false,  // true breaks CDN assets
  });
});
```

`optimize_wordpress: true` exempts known WP plugin signatures (Jetpack callbacks, WP.com Stats) from the bot challenge. Without it, Jetpack plugin stops updating stats. The default is `false`. **Always set true for wordpress.**

`sbfm_static_resource_protection: false` — when on, BFM scores requests for static assets (images, CSS, JS). This catches a few more bots but dramatically increases false-positive challenges for real users and causes CDN cache eviction issues.

## Verify after enabling

```javascript
await execute(async (cloudflare) => {
  const zone_id = "{{zone_id}}";
  return cloudflare.graphql({
    query: `query($zoneTag: String!, $since: Time!) {
      viewer { zones(filter: { zoneTag: $zoneTag }) {
        firewallEventsAdaptiveGroups(
          filter: { datetime_geq: $since, source: "botFight" }
          orderBy: [count_DESC]
          limit: 20
        ) {
          count
          dimensions { action clientCountryName userAgent clientRequestPath }
        }
      }}
    }`,
    variables: { zoneTag: zone_id, since: new Date(Date.now() - 60*60*1000).toISOString() },
  });
});
```

Red flags: high count on browser-like UAs (BFM may be challenging real users), or `/feed/` or `/wp-cron.php` in top paths (exempt those).

## Exempt specific paths from BFM

```javascript
await execute(async (cloudflare) => {
  const phase = await cloudflare.rulesets.phases.get({
    zone_id: "{{zone_id}}", ruleset_phase: "http_request_firewall_custom",
  });
  return cloudflare.rulesets.rules.create({
    zone_id: "{{zone_id}}",
    ruleset_id: phase.result.id,
    action: "skip",
    action_parameters: { phases: ["http_request_firewall_managed"] },
    expression: '(http.request.uri.path in {"/feed/" "/wp-cron.php" "/.well-known/webfinger"})',
    description: "Exempt RSS / cron / webfinger from BFM",
    enabled: true,
    position: { index: 1 },
  });
});
```

## What BFM does NOT replace

- Targeted IP / ASN blocks — use a custom rule.
- Form spam (the Stacked Marketer pattern) — real-looking browser, BFM won't catch it. Use Turnstile + WAF rule.
- L7 DDoS — Cloudflare's separate L7 DDoS protection handles this and is on by default.
