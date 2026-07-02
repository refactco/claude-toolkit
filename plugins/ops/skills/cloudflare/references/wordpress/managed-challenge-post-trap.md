# The "Managed Challenge on /wp-login.php breaks login" trap

A previous engineer sometimes adds a Managed Challenge WAF rule on `/wp-login.php` thinking it'll stop brute-force. It does not. It silently breaks login for every real user, while bots that already solved the challenge once continue trying.

## What goes wrong

Cloudflare's challenge actions (`managed_challenge`, `challenge`, `js_challenge`) work by:

1. Cloudflare intercepts the request.
2. Cloudflare returns its challenge page to the browser.
3. The browser solves the challenge.
4. The browser **re-requests the same URL**, this time with a cookie proving the challenge was solved.

For a **POST** request, the browser does *not* replay the form data in step 4. The original POST body (username and password) is dropped.

Result:
- Visitor loads `wp-login.php` (GET) → challenged → solves → page loads.
- Visitor submits credentials (POST) → challenged → browser re-POSTs with **empty body** → WordPress renders "Empty username" error → user retries → same loop.

## How to detect existing offending rules

```javascript
await execute(async (cloudflare) => {
  const zone_id = "{{zone_id}}";
  const rulesets = await cloudflare.rulesets.list({ zone_id });
  const custom = rulesets.result.find(r => r.phase === "http_request_firewall_custom" && r.kind === "zone");
  if (!custom) return [];
  const full = await cloudflare.rulesets.get({ zone_id, ruleset_id: custom.id });
  return full.result.rules
    .filter(rule =>
      (rule.expression || "").match(/wp-login|wp-admin|xmlrpc/i) &&
      ["managed_challenge", "challenge", "js_challenge"].includes(rule.action)
    )
    .map(r => ({ id: r.id, description: r.description, expression: r.expression, action: r.action, enabled: r.enabled }));
});
```

Common names this rule shows up under: "Botting Login Page", "WP login bot protection", "wp-login.php captcha".

## Fix

| Original intent | Fix |
|---|---|
| Stop brute-force on `/wp-login.php` | Disable the rule; use Access (zero-trust-wp-login workflow) instead. Access blocks at email-entry before POST is even attempted. |
| Block specific IPs | Change action from `managed_challenge` to `block`, narrow the expression to those IPs / ASN / UA. |
| Rate-limit login attempts | Move to rate-limit phase (`http_ratelimit`), scope to `method eq "POST"`, action `block`. |

Disable (don't delete) on first pass — keeping it as `enabled: false` preserves the expression for the next engineer.

```javascript
await execute(async (cloudflare) => {
  return cloudflare.rulesets.rules.edit({
    zone_id: "{{zone_id}}",
    ruleset_id: "{{custom_ruleset_id}}",
    rule_id: "{{offending_rule_id}}",
    enabled: false,
  });
});
```

## What about xmlrpc.php?

XML-RPC is the other WordPress login vector — a single POST to `/xmlrpc.php` can carry 1,999 auth attempts. Don't protect it with Access (Jetpack, the WP mobile app, and ManageWP break when there's an Access challenge in front).

Standard play:
- If the client uses Jetpack or WP mobile app: rate-limit it at 5 requests/min per IP.
- If they don't: block it entirely.

Confirm which applies before changing.
