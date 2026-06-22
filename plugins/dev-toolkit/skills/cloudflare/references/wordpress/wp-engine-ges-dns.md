# When the domain is already CNAMEd to WP Engine's Cloudflare

You're onboarding `example.com` and find that `dig +short www.example.com CNAME` returns something like `12345.wpeproxy.com`. The domain is using WP Engine's **Global Edge Security (GES)** — WP Engine has put their own Cloudflare layer in front of the origin.

## What this means

The CNAME routes traffic through WP Engine's Cloudflare account (their account, not the client's — the client can't see or edit it). **Onboarding DNS to our Cloudflare does not break GES**; it just changes who controls DNS.

What it does mean:
- Our WAF rules won't see real traffic (GES sees it first).
- Our Cache Rules won't see real traffic.
- Our Access apps won't see real traffic.
- DNS management is fully in our hands; security is at WP Engine's edge.

## When this is fine

Most of the time. For clients who chose GES for managed WAF + DDoS + CDN, our job is DNS management. Inform the client that WAF/cache/Access skills will be no-ops until GES is disabled.

## When to ask the client to disable GES

If the reason for moving DNS to us was to enable our WAF/Cache/Access management, we need GES disabled. Use this template:

> Hi {client},
>
> Quick FYI on the {domain} DNS migration to Cloudflare:
>
> Your site is currently using WP Engine's Global Edge Security (GES), which runs WP Engine's own Cloudflare layer in front of your origin. The DNS migration today moves DNS control to our Cloudflare, but real traffic still flows through WP Engine's Cloudflare (GES), so our WAF / caching configuration won't see it.
>
> That's fine if you want to keep GES and use us just for DNS.
>
> If you'd like us to manage WAF / caching directly, you can disable GES via a WP Engine support ticket. Once GES is off, our Cloudflare configuration takes effect immediately. We'd configure equivalent WAF protection so there's no security regression.
>
> Want us to go ahead and request GES be disabled?

## Verification

```bash
dig +short www.example.com CNAME
# wpeproxy.com → GES is on
# absent → no GES

curl -sI https://example.com | grep -i 'cf-cache-status\|x-wpengine'
# X-WPEngine: present + cf-cache-status → traffic on WPE's Cloudflare front
```

## After DNS onboarding when GES is still on

Document in the handoff:
1. DNS onboarding complete — `status: active` in Cloudflare.
2. GES is on; WAF / Cache / Access on our zone are inactive while GES owns the edge.
3. To activate our edge configuration: client opens WP Engine ticket to disable GES.
4. Rules can be authored now and take effect the moment GES is off.
