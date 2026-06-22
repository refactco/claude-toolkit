# Workflow: DNS Onboarding

Create a Cloudflare zone for a client domain and port over DNS records — A/AAAA/CNAME plus email (MX, SPF, DKIM, DMARC).

**When to use:** onboarding a new client domain to Cloudflare.

The agent handles the API side via the `cloudflare-api` MCP server (zone create, record create, status check); the human handles the registrar nameserver swap.

**Conventions (see `../SKILL.md`):** Narration · MCP servers (`cloudflare-api`, `cloudflare-docs`, `cloudflare-dns-analytics`) · Role check — **Super Admin required to create a zone**.

## Preflight

### 1. Check if the domain is already on another account

Do a public DoH lookup for the domain's `NS` records (e.g. `https://cloudflare-dns.com/dns-query?name={{client_domain}}&type=NS` with `accept: application/dns-json`).

- If NS are already `*.ns.cloudflare.com` and the zone is not on this account → the existing owner must delete the zone before you can create it.
- If the apex is a CNAME to `*.wpeproxy.com` → WP Engine GES. See `references/wordpress/wp-engine-ges-dns.md` before continuing.

### 2. Snapshot existing DNS (so nothing is lost)

Ask the client which mail providers they use (Google Workspace, M365, Mailchimp, etc.) so you know which DKIM selectors to probe. See `references/wordpress/email-records.md`.

Probe public DNS (DoH) for at minimum:

- Apex: `A`, `AAAA`, `MX`, `TXT`
- `www.{{client_domain}}`: `CNAME`
- `_dmarc.{{client_domain}}`: `TXT`
- DKIM selectors based on provider: `google._domainkey`, `selector1._domainkey`, `k1._domainkey`, etc.

Save the results as the reconciliation baseline.

## Create the zone

Via `cloudflare-api`: create a zone for `{{client_domain}}` under `{{account_id}}` with `type: "full"` and `jump_start: true` (Cloudflare best-effort imports public records).

Surface the two returned nameservers to the user — they must give them to the client to set at the registrar.

## Reconcile records

List the records jump-start imported, diff against the snapshot, then add anything missing.

Jump-start commonly misses: DKIM TXTs (selector unguessable), email-provider verification TXTs, non-public subdomains, MX priorities on niche providers.

For a brand-new DMARC record, default to:

```
v=DMARC1; p=none; rua=mailto:dmarc@{{client_domain}};
```

Proxy defaults:
- `A` / `AAAA` / `CNAME` for apex + `www` → **proxied** (orange).
- `MX`, mail subdomains (`mail.`, `smtp.`, `imap.`), all email-related TXT → **never proxied** (Cloudflare doesn't proxy SMTP/IMAP).
- SaaS subdomains → unproxied unless asked.

**DMARC safety:** if a record already exists, copy it as-is. If new, default to `p=none`. Do not deploy `p=reject` without explicit consent.

See `references/wordpress/dns-proxy-status.md` for full proxy-status guidance.

## Activate

After the client changes nameservers:

1. Get the zone via `cloudflare-api` and read `status` + `name_servers`.
2. If still `pending`, trigger an immediate activation recheck.
3. `status: "active"` means Cloudflare's NS are live. Confirm propagation via the `cloudflare-dns-analytics` MCP (query volume should ramp up).

## Failure → fix table

| Symptom | Cause | Fix |
|---|---|---|
| `zones.create` returns "Zone already exists" | Domain on another CF account | Existing owner must delete it there first |
| Zone stays `pending` 48h+ | Old NS still at registrar, or DNSSEC DS still in registry | Client removes old NS + disables DNSSEC. See `references/wordpress/dnssec-handling.md`. |
| Mail bounces after switch | Missing DKIM selector or wrong MX priority | Diff against snapshot, add missing records. See `references/wordpress/email-records.md`. |
| Records create but site goes offline | Apex A record proxied to wrong origin IP | Verify origin IP and proxy status on apex |
| "Permission denied" on `zones.create` | Domain Admin, not Super Admin | See SKILL.md § Role check |

## References

- [`references/wordpress/email-records.md`](../references/wordpress/email-records.md) — DKIM selectors per provider, SPF merge rules, DMARC defaults
- [`references/wordpress/dns-proxy-status.md`](../references/wordpress/dns-proxy-status.md) — orange vs gray per record type
- [`references/wordpress/wp-engine-ges-dns.md`](../references/wordpress/wp-engine-ges-dns.md) — domain already on WP Engine's Cloudflare
- [`references/wordpress/dnssec-handling.md`](../references/wordpress/dnssec-handling.md) — disable old / enable new DNSSEC
