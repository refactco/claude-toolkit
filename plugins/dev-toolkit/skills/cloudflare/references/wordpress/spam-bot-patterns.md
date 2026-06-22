# Recurring spam patterns and what to do about them

Patterns we've seen in production on Refact clients. When a client reports "form spam" or "weird signups", check this list first.

## The `u##########@gmail.com` spam wave

**Signature:**
- Email: `u` followed by 7–10 digits, `@gmail.com`. E.g., `u1563763635@gmail.com`.
- User-agent: stable across submissions — `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36`.
- IP: rotating IPv6 across a few /48 prefixes. Observed prefixes:
  - `2a06:1280::/32` — Path Network
  - `2a06:a006::/32` — Path Network
  - `2c0f:f530::/32`
  - `2600:3c0b::/32` — Vultr
- Volume: 10–50 submissions per day, persistent across weeks.

**Why it evades simple defenses**: real Gmail accounts, so honeypot / email validity checks pass. IP rotation defeats per-IP rate limiting.

**The three-layer fix:**

1. **Cloudflare Managed Challenge rule on the IP ranges + UA:**
```text
(ip.src in {2a06:1280::/32 2a06:a006::/32 2c0f:f530::/32 2600:3c0b::/32}
 and lower(http.user_agent) contains "chrome/142.0.0.0 safari/537.36")
```
Action: start with `managed_challenge`, watch firewall events 24h, then switch to `block`.

2. **Refact's WordPress plugin regex blocklist on the email pattern**: `^u\d{7,10}@gmail\.com$`

3. **Cloudflare Turnstile on the form** (or reCAPTCHA) — third layer for when the bot rotates to a new IPv6 range.

Monitor: pull firewall events graph 24h after deployment. The co-occurrence of IP range + UA is the signal — real Chrome/142 users from those prefixes are statistically near zero for a US-targeted publisher.

## "AI crawler hammering archive pages" pattern

**Signature:**
- 436,000+ requests/week from crawlers to deep archive / paginated pages.
- 21% cache hit rate or lower; origin CPU elevated.
- This is NOT a security problem per se — Googlebot is legitimate. But it acts like a DDoS.

**Fixes:**
- **cache-debug workflow** to raise cache hit rate (cache 404s and archive pages aggressively).
- **This skill** to block specific unwanted AI crawlers (see `waf-common-patterns.md`).
- **Google Search Console** crawl-budget configuration for Googlebot.

## "Chinese IP scanner" pattern

**Signature:** A specific IP from CN ASNs starts running directory brute-force against `/wp-admin/`, `/.env`, etc. 2000–5000 failed requests within an hour.

**Fix:** IP Access Rule, action `block`:

```javascript
await execute(async (cloudflare) => {
  return cloudflare.firewall.accessRules.create({
    zone_id: "{{zone_id}}",
    mode: "block",
    configuration: { target: "ip", value: "{{bad_ip}}" },
    notes: "Vuln scanner — Refact {{date}}",
  });
});
```

If they rotate IPs within the same /24, escalate to a custom rule on the /24 or ASN.

## How to find the actual signature

Don't guess — pull data from the firewall events graph (`cloudflare-graphql` MCP) or plugin logs. Pivot on:
1. Email regex pattern
2. IP — distinct /48 prefixes among bad submissions
3. User-agent — is it always the same? Suspiciously stable?
4. Submission timing — same time of day? Same minute?
5. Referer — all no-referer or same referer?
6. Form field timing — submitting in under 1s = bot.
