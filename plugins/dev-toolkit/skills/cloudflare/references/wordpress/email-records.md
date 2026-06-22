# Email DNS records — SPF, DKIM, DMARC

The records that, if missed, cause "we migrated DNS and now our mail bounces" tickets. Read this before any DNS migration where the domain sends email.

## SPF (Sender Policy Framework)

A single TXT record at the root domain (`@`). Tells receiving servers which IPs / hostnames are allowed to send mail as this domain.

```
v=spf1 include:_spf.google.com include:servers.mcsv.net ~all
```

Rules:
- **Only one SPF TXT per domain.** Multiple SPF TXTs = receiving servers fail SPF (RFC 7208 §3.2). When clients add a new mail provider, **merge** into the existing record, don't append a second TXT.
- Each `include:` counts as a DNS lookup; total must be ≤10 (RFC limit).
- `~all` (softfail) is common. `-all` (hardfail) is stricter and recommended once all senders are listed.

### Common SPF include values per provider

| Provider | Include value |
|---|---|
| Google Workspace | `include:_spf.google.com` |
| Microsoft 365 | `include:spf.protection.outlook.com` |
| Mailchimp Transactional (Mandrill) | `include:spf.mandrillapp.com` |
| Mailchimp Marketing | `include:servers.mcsv.net` |
| SendGrid | `include:sendgrid.net` |
| Postmark | `include:spf.mtasv.net` |
| HubSpot | `include:_spf.hubspot.com` |
| Mailgun | `include:mailgun.org` |
| Brevo (Sendinblue) | `include:spf.sendinblue.com` |
| Amazon SES | `include:amazonses.com` |

## DKIM (DomainKeys Identified Mail)

A TXT record at `<selector>._domainkey.<domain>`. The selector is provider-specific.

| Provider | DKIM selectors |
|---|---|
| Google Workspace | `google._domainkey` |
| Microsoft 365 | `selector1._domainkey` and `selector2._domainkey` (CNAMEs) |
| Mailchimp Marketing | `k1._domainkey` (TXT, sometimes also `k2._domainkey`) |
| Mailchimp Transactional | `mte1._domainkey` (CNAME) |
| SendGrid | `s1._domainkey`, `s2._domainkey` (CNAMEs) |
| Postmark | `pm._domainkey` (CNAME) |
| HubSpot | `hs1-{accountid}._domainkey`, `hs2-{accountid}._domainkey` (CNAMEs) |
| Mailgun | `mail._domainkey` (TXT) |
| Brevo | `mail._domainkey` (TXT) |
| Amazon SES | three CNAMEs at `<token>._domainkey` (tokens from SES console) |

**If you can't find DKIM**: ask the client which mail providers they use. Some clients haven't set up DKIM at all — nothing to migrate.

## DMARC

A single TXT record at `_dmarc.<domain>`.

```
v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; sp=quarantine; pct=100;
```

Tags:
- `p=` — `none` (monitor only), `quarantine` (send to spam), `reject` (bounce)
- `rua=` — aggregate report destination
- `pct=` — percentage of failing mail this policy applies to

**For onboarding**: copy the existing DMARC TXT exactly. Do not change `p=` without explicit approval — going from `p=none` to `p=quarantine` will start filtering legitimate mail.

**For new domains**: start at `p=none;` and set `rua=` to a monitored mailbox. Review reports after 2–4 weeks before recommending tighter enforcement.

## Verification after migration

```bash
dig example.com TXT +short | grep "v=spf1"
dig google._domainkey.example.com TXT +short
dig _dmarc.example.com TXT +short
dig MX example.com +short
```

Send a test email to **mail-tester.com** — score should be 10/10 or close. Fix before declaring DONE.

## When email breaks after migration

1. **MX records missed** — `dig MX example.com +short` returns nothing. Add the missing MX records.
2. **SPF lost** — re-add the SPF TXT.
3. **DKIM selector mismatch** — often the migration created `selector._domainkey.example.com.example.com` (duplicated suffix). Fix: edit the record to use just `selector._domainkey`.
4. **DKIM value truncated** — TXT records over 255 chars need quoted-segment splitting. Cloudflare dashboard handles this; if you used the API, split the string.
5. **DMARC blocking** — if a previous engineer set `p=reject` and SPF/DKIM regressed, mail bounces. Temporarily drop to `p=none` while debugging.
