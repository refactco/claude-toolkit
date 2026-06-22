# The `skip` action — office allowlists that don't silently fail

`skip` is right for "this traffic should bypass our security". The dangerous part: `skip` is scoped, and getting `action_parameters` wrong produces an allowlist that does nothing.

## The four scopes of skip

| `action_parameters` field | What it does |
|---|---|
| `ruleset: "current"` | Skip remaining rules in the same custom ruleset only. Does NOT skip managed rulesets, rate-limit, or BFM. |
| `phases: ["http_request_firewall_managed", "http_ratelimit"]` | Skip listed phases entirely. Usually what you want for an office allowlist. |
| `products: ["waf", "rateLimit", "uaBlock", "hot", "zoneLockdown", "securityLevel", "bic"]` | Skip specific Cloudflare security products. Belt-and-suspenders. |
| `rules: { "<ruleset_id>": ["<rule_id>"] }` | Skip specific rules. Narrowest, hardest to maintain. |

## The pattern that actually allowlists

```javascript
await execute(async (cloudflare) => {
  const phase = await cloudflare.rulesets.phases.get({
    zone_id: "{{zone_id}}", ruleset_phase: "http_request_firewall_custom",
  });
  return cloudflare.rulesets.rules.create({
    zone_id: "{{zone_id}}",
    ruleset_id: phase.result.id,
    action: "skip",
    action_parameters: {
      ruleset: "current",
      phases: ["http_request_firewall_managed", "http_ratelimit"],
      products: ["bic", "hot", "rateLimit", "securityLevel", "uaBlock", "waf", "zoneLockdown"],
    },
    expression: 'ip.src in {203.0.113.0/24 198.51.100.7}',
    description: "Skip all security for Refact + client offices",
    enabled: true,
    position: { index: 1 },
  });
});
```

## Position is everything

Custom rules execute **top to bottom, first match wins**. If your block rule is at position 1 and the skip rule is at position 2, the office-IP hits the block first. Always use `position: { index: 1 }` on skip rules.

Confirm position after create:

```javascript
await execute(async (cloudflare) => {
  const phase = await cloudflare.rulesets.phases.get({
    zone_id: "{{zone_id}}", ruleset_phase: "http_request_firewall_custom",
  });
  return phase.result.rules.map((r, i) => ({ index: i+1, id: r.id, action: r.action, expression: r.expression }));
});
```

## What `skip` does NOT skip

- **Zero Trust Access.** Access is enforced at a different layer (Cloudflare for Teams), not the WAF ruleset engine.
- **L3/L4 DDoS protection.** Always on.

## Common mistake

```javascript
// WRONG: only skips remaining rules in the SAME ruleset.
// Managed challenge rules in the managed phase still fire.
action_parameters: { ruleset: "current" }

// RIGHT: skip the managed phase too
action_parameters: {
  ruleset: "current",
  phases: ["http_request_firewall_managed", "http_ratelimit"],
}
```

If the client says "we whitelisted our office but we still get challenged" — this is the reason.
