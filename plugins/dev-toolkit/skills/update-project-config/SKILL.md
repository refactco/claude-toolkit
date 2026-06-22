---
name: update-project-config
description: Write confirmed project facts into .refact-os.json immediately — env vars discovered, IDs mentioned, domains confirmed, services set up, commands established. Keeps the file current so it stays a reliable agent context source.
pattern: procedure
when_to_use: Any turn that produces or confirms a project-specific fact that belongs in .refact-os.json — an ID mentioned in chat, a var added to .env, a domain confirmed, an integration set up, a command established. Run this before ending the turn; never defer.
when_not_to_use: Updating the canonical prose record (blueprint/proposal/spec) — use update-canonical-record for that. Secrets or secret values — never write those here.
next_skills: []
sub_agents: []
---

# Update Project Config

## Standing rule

Whenever you confirm or discover project-specific data during **any** task, write it to `.refact-os.json` before finishing the turn. The file is only as useful as it is current. Do not defer this to a later cleanup pass.

## Trigger → field map

| You just did this | Write here |
|---|---|
| Client mentioned a GA4 ID | `integrations.analytics.ga4` |
| Client mentioned a GTM container ID | `integrations.analytics.gtm` |
| Client mentioned a Hotjar site ID | `integrations.analytics.hotjar` |
| Added a var to `.env` or `.env.example` | `integrations.<service>.vars[]` |
| Set up a Netlify / Vercel site | `apps[n].hosting`, `apps[n].netlifySite` or `apps[n].vercelProject` |
| Created a Sentry project | `integrations.sentry.org`, `.project`, `.dsn` |
| Confirmed production domain | `stack.<type>.environments.production.url` |
| Confirmed staging domain | `stack.<type>.environments.staging.url` |
| Established branch strategy | `repository.productionBranch`, `repository.integrationBranch` |
| Confirmed hosting provider | `stack.<type>.hosting` |
| Set up SSH access for an env | `stack.wordpress.environments.<env>.ssh.*` |
| New integration added (Stripe, Mailchimp, Twilio, etc.) | New block under `integrations.<service>` |
| Confirmed dev / test / build / deploy command | `operations.<command>` |
| PHP version confirmed | `stack.wordpress.phpVersion` |
| WP theme name confirmed | `stack.wordpress.theme.name` |
| Next.js router type confirmed (app / pages) | `stack.nextjs.router` |
| Package manager confirmed | `stack.nextjs.packageManager` |
| Database provider confirmed | Top-level `database` block |
| Ahrefs project ID confirmed | `integrations.seo.ahrefs.projectId` |
| Canonical domain confirmed | `integrations.seo.canonicalDomain` |
| Project name / slug confirmed | `project.name`, `project.slug` |
| Project kind confirmed | `project.kind` |
| Project description agreed | `project.description` |

## Steps

1. **Verify it belongs to this project.** If the data was mentioned in context but it's ambiguous which project it refers to, confirm before writing.
2. **Identify the target field** using the trigger map above. If no row matches, use your judgment — the file is freely extensible.
3. **Check the current value.** Read the relevant section of `.refact-os.json` first. If it is already set to the correct value, do nothing.
4. **Write the smallest change** that captures the new fact. Surgical edits only — never rewrite whole sections.
5. **For `integrations.<service>.vars[]`**: only add the var name, never the value. For public IDs (GTM, GA4, Stripe publishable key, Sentry DSN), the actual value is safe to store — these are designed to appear in browser bundles.
6. **For a new integration service** not yet in `integrations`: add a block with at minimum `vars: []` and fill in what is known.

## Hard rules

- **Never store secret values** — API keys, tokens, passwords, private keys. Only var names (`"vars": ["STRIPE_SECRET_KEY"]`) and pointers to where they live.
- **Public IDs are fine to store directly** — GTM container ID, GA4 measurement ID, Stripe publishable key (`pk_live_…`), Sentry DSN, Hotjar site ID, Cloudflare zone ID. These are public by design.
- **Surgical edits only.** Don't reformat the file or reorder keys.
- **One write per turn** if multiple facts were confirmed. Batch them into a single `.refact-os.json` edit.
- If a value conflicts with what is already recorded, note both and flag it rather than silently overwriting.

## `integrations` block shape

New services follow this pattern — add only the fields you know:

```json
"integrations": {
  "stripe": {
    "publishableKey": "pk_live_...",
    "vars": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    "mode": "live"
  },
  "sendgrid": {
    "fromDomain": "mail.example.com",
    "vars": ["SENDGRID_API_KEY"]
  },
  "analytics": {
    "gtm": "GTM-XXXXXX",
    "ga4": "G-XXXXXXXXXX"
  },
  "sentry": {
    "org": "refactco",
    "project": "example",
    "dsn": "https://abc@o123.ingest.sentry.io/456"
  },
  "seo": {
    "canonicalDomain": "https://www.example.com",
    "ahrefs": { "projectId": "12345" }
  }
}
```
