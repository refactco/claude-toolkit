# Proxy status per record — orange or gray

The orange-cloud / gray-cloud toggle decides whether Cloudflare's CDN / WAF / SSL termination is in path for that hostname.

| Record / hostname | Default | Why |
|---|---|---|
| `@` (apex) `A`/`AAAA` for the main site | **Orange** | Run Cloudflare in front; CDN + WAF + caching |
| `www` `CNAME` to apex / to host | **Orange** | Same as apex |
| `MX` records | **N/A (always DNS-only)** | Cloudflare does not proxy SMTP |
| Mail-host A records (`mail.`, `smtp.`, `imap.`) | **Gray** | Proxying breaks SMTP/IMAP; mail clients connect direct to origin |
| Email-provider verification TXTs (SPF, DMARC, DKIM) | **N/A (TXT is never proxied)** | |
| Subdomain at SaaS (`status.example.com` → Statuspage) | **Depends — ask** | If client wants Cloudflare in front, orange. If not, gray. |
| `api.example.com` | **Orange usually** | Unless client expects raw TCP / non-HTTP |
| `staging.example.com` → WP Engine staging | **Orange** | WP Engine's GES is on the apex; staging subdomain often isn't on GES, so proxy normally |
| `autodiscover.example.com` (Microsoft Outlook) | **Gray** | Outlook clients need direct connection |

## SSL mode for proxied records

| SSL Mode | Cloudflare → origin |
|---|---|
| Off | HTTP only. Never use this. |
| Flexible | HTTP from Cloudflare to origin. Visitor sees HTTPS. Insecure. Don't use. |
| Full | HTTPS to origin, Cloudflare does **not** validate the cert. Self-signed OK. |
| Full (Strict) | HTTPS to origin + Cloudflare validates the cert. **Use this for WP Engine and Kinsta** — both have valid certs. |

## Quick rules of thumb

- Orange-cloud apex + www; gray everything else; ask about subdomains.
- Verify after every move: `curl -I https://example.com` — `cf-ray:` present = orange-clouded; absent = gray.
- Don't orange-cloud anything you don't want a WAF rule to affect.

## Orange-clouding a record that points at WP Engine

When the apex CNAME points at `*.wpengine.com` (not `*.wpeproxy.com`), orange-cloud it normally.

When it points at `*.wpeproxy.com`, GES is in path and orange-clouding routes through *two* Cloudflare layers — usually fine, but cache headers and IP source headers get weird. See `wp-engine-ges-access.md` for the decision.
