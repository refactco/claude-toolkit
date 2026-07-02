---
name: gsc
description: Google Search Console toolkit — connect once, then pull search-performance reports, manage sitemaps, and run URL Inspection for any project's site. Read-only by default; sitemap submit/delete are the only writes and are explicit.
pattern: procedure
when_to_use: Any task needing Google Search Console data or actions for the current project — SEO audits, striking-distance/decay/cannibalization analysis, monthly health reports, checking index coverage of specific URLs, or listing/submitting sitemaps. Also the first stop when GSC isn't connected yet.
when_not_to_use: Non-search analytics (use GA4 tooling). Out of scope: interpreting or prioritizing findings into recommendations — this skill pulls and acts on GSC data, it doesn't score it.
next_skills: []
sub_agents: []
references:
  - connect
  - performance
  - sitemaps
  - url-inspection
---

# Google Search Console (GSC)

This skill is the single entry point for everything Search Console. It shares one
auth + config model across every action, then splits into focused references for
each capability. **Load the reference that matches the task** — don't read them
all up front.

## Shared model (applies to every reference)

- **Credentials**: the 1Password item `GOOGLE SERVICES TOKEN` (vault `Env Variables & Secrets`) holds `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`. The refresh token is created once via the connect flow.
- **Target site**: comes from `gsc.siteUrl` in the project's `.refact-os.json` (e.g. `https://example.com/` or `sc-domain:example.com`). If it's missing, ask the user for it and write it in yourself before running anything (see the connect reference).
- **Scripts** live in `scripts/` and share `scripts/_shared.mjs` (1Password reads, `.refact-os.json` lookup, token exchange). Run them from inside the project so `.refact-os.json` resolves.
- **Safety**: every action is read-only except `gsc-sitemaps.mjs --submit` / `--delete`. Before running either, you **MUST** show the user the exact action (the sitemap URL and whether it's submit or delete) and get their **explicit written approval in a chat message**. Only then pass the required `--confirm` flag. The script hard-refuses any write without `--confirm`; never supply `--confirm` on the user's behalf without their written go-ahead.

## Pick the right reference

| The task is… | Use reference | Script |
|---|---|---|
| "Connect GSC", first-time setup, token expired, `invalid_grant`, no `gsc.siteUrl` | **connect** | `gsc-login.mjs` |
| Which properties can this account see? Confirm the exact property string / that `gsc.siteUrl` is valid | **connect** | `gsc-sites.mjs` |
| Queries / pages / devices / countries, trends, period comparison, cannibalization, branded split, export to CSV | **performance** | `gsc-queries.mjs` |
| List submitted sitemaps + indexed counts/errors; submit or remove a sitemap | **sitemaps** | `gsc-sitemaps.mjs` |
| Index status of specific URLs — coverage, canonical, last crawl, robots.txt state, page-fetch errors, mobile/rich-results | **url-inspection** | `gsc-inspect.mjs` |

## What the GSC API can and cannot give you

Important: the Search Console **API exposes far less than the GSC web UI**. Several
reports have no API at all. Use this map so you fetch what's possible and route the
rest to the right source instead of promising data GSC can't return.

**Covered by this skill (the full official GSC API surface):**

| Need | How |
|---|---|
| Search performance (clicks/impressions/CTR/position, trends, compare) | `gsc-queries.mjs` |
| Index status of a URL: indexed?, coverage state, Google vs declared canonical, last crawl, crawl-as | `gsc-inspect.mjs` |
| **robots.txt state** for a URL (allowed/disallowed) | `gsc-inspect.mjs` → `robotsTxtState` |
| **Page errors** for a URL (soft 404, not found, redirect/server error) | `gsc-inspect.mjs` → `pageFetchState` |
| Rich-results / mobile-usability verdict for a URL | `gsc-inspect.mjs` → `richResults`, `mobileUsability` |
| Sitemaps: submitted vs indexed counts, errors, warnings | `gsc-sitemaps.mjs` |
| Accessible properties / permission levels | `gsc-sites.mjs` |

**NOT available via the GSC API — do not expect these here:**

| GSC UI report | Why / where to get it instead |
|---|---|
| **Core Web Vitals / Page Experience** | The GSC UI builds these from CrUX field data — there is no GSC API for it. Use the **CrUX API** or **PageSpeed Insights API** (a separate, key-based service; would be its own skill). |
| **Crawl Stats** (crawl requests over time, host status, response-code/file-type breakdown) | No API. UI only (Settings → Crawl stats), or analyze server access logs. |
| **Aggregate index coverage** ("Pages" report — counts/reasons pages aren't indexed) | No bulk API. Approximate it by running `gsc-inspect.mjs` over a list of URLs (e.g. pages from a performance pull or sitemap), or read the UI. |
| **Links report** (top linking sites, internal links, anchor text) | No API. UI only, or a third-party backlink tool. |
| **Manual Actions / Security Issues** | No API. UI only. |
| **Enhancement reports in aggregate** (e.g. all pages with a schema type) | No aggregate API; per-URL only via `gsc-inspect.mjs`. |

Note: Google retired the **Mobile Usability** report (Dec 2023); the inspection API's
`mobileUsability` field now commonly returns `VERDICT_UNSPECIFIED`.

## File structure

```
SKILL.md                  ← you are here (shared model + router)
references/
  connect.md              ← one-time OAuth, creds, gsc.siteUrl, troubleshooting
  performance.md          ← gsc-queries.mjs: search-analytics reports
  sitemaps.md             ← gsc-sitemaps.mjs: list/submit/delete sitemaps
  url-inspection.md       ← gsc-inspect.mjs: per-URL index status
scripts/
  _shared.mjs             ← auth + config helpers (imported by the others)
  gsc-login.mjs  gsc-sites.mjs  gsc-queries.mjs  gsc-sitemaps.mjs  gsc-inspect.mjs
```

## Prerequisites (one-time)

- 1Password CLI (`op`) installed and signed in (`op whoami`).
- Node 18+.
- A `GOOGLE_REFRESH_TOKEN` in the 1Password item — if empty, start with the **connect** reference.

For audit evidence, save any script's JSON/CSV output under `docs/sources/raw/gsc-<date>.<ext>` — create that directory on demand if it doesn't exist yet.
