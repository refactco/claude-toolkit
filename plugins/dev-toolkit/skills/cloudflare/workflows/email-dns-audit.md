# Workflow: Email DNS Audit

Audit a domain's email DNS records (SPF, DKIM, DMARC, MX) and report pass / warn / fail per check.

**When to use:** before or after a DNS migration, when a client reports mail deliverability issues, or as a pre-launch checklist item.

**Does NOT change anything** — this workflow is read-only. To fix issues found, use `dns-onboarding.md` or add records manually.

**Conventions (see `../SKILL.md`):** Narration · MCP servers (`cloudflare-api`, `cloudflare-docs`).

No authentication is required to *read* DNS — all probes use Cloudflare's public DoH API (`cloudflare-dns.com/dns-query` with `accept: application/dns-json`). The `cloudflare-api` MCP is only needed for Step 5 (comparing against the Cloudflare zone).

---

## Step 1 — Identify the mail providers in use

Ask the client which providers send email on this domain (Google Workspace, M365, Mailchimp, HubSpot, SendGrid, Postmark, Mailgun, Brevo, etc.). This determines which DKIM selectors to probe.

If the client doesn't know, run the audit anyway — the SPF `include:` directives will reveal the providers.

---

## Step 2 — Snapshot all email DNS records

Probe public DNS in parallel:

| Name | Type | Purpose |
|---|---|---|
| `{{d}}` | `MX` | Inbound mail |
| `{{d}}` | `TXT` | SPF + verification TXTs |
| `_dmarc.{{d}}` | `TXT` | DMARC policy |
| `google._domainkey.{{d}}` | `TXT` | Google Workspace DKIM |
| `selector1._domainkey.{{d}}` | `CNAME` | M365 DKIM |
| `selector2._domainkey.{{d}}` | `CNAME` | M365 DKIM |
| `k1._domainkey.{{d}}` | `TXT` | Mailchimp DKIM |
| `k2._domainkey.{{d}}` | `TXT` | Mailchimp DKIM |
| `s1._domainkey.{{d}}` | `CNAME` | SendGrid DKIM |
| `s2._domainkey.{{d}}` | `CNAME` | SendGrid DKIM |
| `pm._domainkey.{{d}}` | `CNAME` | Postmark DKIM |
| `hs1._domainkey.{{d}}` | `CNAME` | HubSpot DKIM |
| `hs2._domainkey.{{d}}` | `CNAME` | HubSpot DKIM |
| `mail._domainkey.{{d}}` | `TXT` | Mailgun / Brevo DKIM |

Save the answers and DNS `Status` (0 = NOERROR, 3 = NXDOMAIN) as the snapshot.

---

## Step 3 — Evaluate the results

Apply these criteria to the snapshot:

### MX
- **FAIL** — no MX records. Domain cannot receive email.
- **WARN** — only one MX record. Recommend ≥2 for redundancy.
- **PASS** — ≥2 MX records.

### SPF (TXTs containing `v=spf1`)
- **FAIL** — none found.
- **FAIL** — more than one (RFC 7208 §3.2 — receivers reject).
- **FAIL** — contains `+all` (anyone can spoof as this domain).
- **WARN** — missing `-all` or `~all` terminator.
- **PASS** — single record, valid terminator.

### DMARC (`_dmarc` TXT)
- **FAIL** — none found.
- **WARN** — `p=none` (monitor only). Recommend `p=quarantine` then `p=reject` once SPF/DKIM clean.
- **WARN** — no `rua=` (no aggregate reports).
- **PASS** — `p=quarantine` or `p=reject` with `rua=`.

### DKIM
- **WARN** — no DKIM TXT/CNAME found for any probed selector (if domain sends email).
- **PASS** — at least one selector resolves. List the providers found.

---

## Step 4 — Produce the audit report

Format as a summary for the ticket or Slack thread:

```
Email DNS Audit — {{client_domain}} — {{date}}

✅ PASS
  - MX records present (2 entries)
  - Single SPF record found: v=spf1 include:_spf.google.com ~all
  - DMARC record found: p=quarantine; rua=mailto:dmarc@example.com
  - DKIM found for: Google Workspace (google._domainkey)

⚠️ WARN
  - DMARC policy is p=quarantine. Recommend upgrading to p=reject after 2–4 weeks of clean reports.

❌ FAIL
  - Multiple SPF records found (2). Merge into one.
```

---

## Step 5 — Compare against Cloudflare zone (if domain is on our CF account)

If the domain is in a Cloudflare zone, list DNS records via `cloudflare-api` (filter to `MX`, `TXT`, anything with `_domainkey` or `_dmarc`) and diff against the DoH snapshot. Discrepancies = the Cloudflare zone has wrong or missing records (jump-start sometimes miscreates them).

---

## Common findings and fixes

| Finding | Fix |
|---|---|
| No MX records | Add MX records for the mail provider. See `references/wordpress/email-records.md`. |
| Multiple SPF records | Merge all `include:` directives into a single TXT. |
| `+all` in SPF | Replace with `~all` or `-all` immediately. |
| No DMARC | Add `v=DMARC1; p=none; rua=mailto:postmaster@{{domain}};`. Start at `p=none`. |
| `p=none` with old age | Suggest upgrading to `p=quarantine` then `p=reject` once reports are clean. |
| No DKIM for a known provider | Ask client to re-authenticate domain in the provider's dashboard to get the selector, then add the TXT/CNAME. |
| DKIM TXT value truncated | TXT records over 255 chars need quoted-segment splitting. Re-add via the Cloudflare dashboard (handles splitting automatically). |

## References

- [`references/wordpress/email-records.md`](../references/wordpress/email-records.md) — SPF include values per provider, DKIM selector list, DMARC tags
- [`workflows/dns-onboarding.md`](./dns-onboarding.md) — if records need to be added/fixed in Cloudflare
