---
name: pagespeed
description: Page-speed and Core Web Vitals for any project's site — real-user field data from the Chrome UX Report (CrUX) and on-demand Lighthouse lab audits via the PageSpeed Insights API. Fills the Core Web Vitals gap that the Search Console API can't (CWV has no GSC API). Read-only.
pattern: procedure
when_to_use: Any task about page speed, performance, or Core Web Vitals (LCP/INP/CLS) for the current project — "how's our CWV", "are we passing Core Web Vitals", "why is this page slow", "what should we fix for speed", performance sections of an SEO/site audit, or tracking CWV over time.
when_not_to_use: Search-performance/index/sitemap data (use the gsc skill). Non-Google performance tooling. Out of scope: interpreting or prioritizing findings into a backlog — this skill pulls performance data, it doesn't score it.
next_skills: []
sub_agents: []
---

# PageSpeed & Core Web Vitals

Two complementary data sources, one shared API key. Read-only.

- **Field data (CrUX)** — `pagespeed-cwv.mjs`. Real Chrome users, trailing 28 days. This is the **same data Search Console's Core Web Vitals report is built from** — and there is no GSC API for it, so this skill is how an agent gets CWV programmatically.
- **Lab data (Lighthouse via PSI)** — `pagespeed-audit.mjs`. A fresh, controlled Lighthouse run for any URL, with the top opportunities to fix. Works even on low-traffic pages that have no field data.

**Use field data to judge "are we passing Core Web Vitals"; use lab data to diagnose "why and what to fix."** They will differ — lab runs on a throttled mid-tier phone, field reflects your real users — and that difference is expected, not a bug.

## Auth & config (shared model)

- **API key** (not OAuth): `GOOGLE_API_KEY` on the 1Password item `GOOGLE SERVICES TOKEN` (vault `Env Variables & Secrets`). This is a different credential from the gsc skill's OAuth token — CrUX requires a key and PSI needs one for usable quota. If it's missing, see "Prerequisites".
- **Target site**: derived from `gsc.siteUrl` in `.refact-os.json` (normalized to a plain origin/URL — `sc-domain:` properties are converted to `https://<domain>`). Override per-run with `--origin=` / `--url=`.
- Run the scripts from inside the project so `.refact-os.json` resolves.

## Field data — `pagespeed-cwv.mjs`

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/pagespeed/scripts/pagespeed-cwv.mjs                    # origin from config
node ${CLAUDE_PLUGIN_ROOT}/skills/pagespeed/scripts/pagespeed-cwv.mjs --url=https://example.com/pricing
node ${CLAUDE_PLUGIN_ROOT}/skills/pagespeed/scripts/pagespeed-cwv.mjs --form-factor=PHONE --history
```

- `--origin=URL` (default) or `--url=URL` for a specific page.
- `--form-factor=PHONE|DESKTOP|TABLET` (default: all combined).
- `--history` — weekly p75 timeseries (~25 periods) instead of the latest snapshot.

Output: per-metric p75, the good/needs-improvement/poor distribution, and a `verdict` (GOOD / NEEDS_IMPROVEMENT / POOR) against Google's thresholds, plus a top-level `coreWebVitalsAssessment`:

- `PASS` — all three **core** metrics (LCP, INP, CLS) are GOOD at p75.
- `FAIL` — at least one core metric is not GOOD.
- `INSUFFICIENT_DATA` / `NO_DATA` — CrUX lacks enough Chrome traffic for this origin/URL (common for small sites or specific pages; INP especially is often missing). Not a setup error.

### CWV thresholds (p75)

| Metric | Good | Poor | Core? |
|---|---|---|---|
| LCP (Largest Contentful Paint) | ≤ 2500 ms | > 4000 ms | ✅ |
| INP (Interaction to Next Paint) | ≤ 200 ms | > 500 ms | ✅ |
| CLS (Cumulative Layout Shift) | ≤ 0.10 | > 0.25 | ✅ |
| FCP (First Contentful Paint) | ≤ 1800 ms | > 3000 ms | — |
| TTFB (Time to First Byte) | ≤ 800 ms | > 1800 ms | — |

## Lab data — `pagespeed-audit.mjs`

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/pagespeed/scripts/pagespeed-audit.mjs                  # homepage, mobile
node ${CLAUDE_PLUGIN_ROOT}/skills/pagespeed/scripts/pagespeed-audit.mjs --url=https://example.com/pricing --strategy=desktop
node ${CLAUDE_PLUGIN_ROOT}/skills/pagespeed/scripts/pagespeed-audit.mjs --categories=performance,seo,accessibility
```

- `--url=URL` (default: site homepage from config).
- `--strategy=mobile` (default) `| desktop`.
- `--categories=` — comma-separated: `performance` (default), `accessibility`, `best-practices`, `seo`. (There is no `pwa` — Lighthouse 12 removed that category.)
- `--top=N` — number of opportunities to return (default 8).

Output: category `scores` (0–1), key `labMetrics` (LCP/FCP/CLS/TBT/Speed Index/TTI with values + display strings), `opportunities` (ranked by estimated ms saved — the "what to fix" list), `flaggedAudits` (other sub-90 audits), and `fieldData` (CrUX data PSI bundles when the URL has coverage). A Lighthouse run takes ~10–30s.

## Relationship to the `gsc` skill

GSC's Core Web Vitals / Page Experience report has **no API** — the gsc skill explicitly routes CWV here. Pair them: pull pages from a GSC performance report, then feed URLs of interest to `pagespeed-cwv.mjs` (field verdict) and `pagespeed-audit.mjs` (fix list).

## Prerequisites (one-time)

1. In the Google Cloud project: enable the **PageSpeed Insights API** and **Chrome UX Report API**.
2. Create an **API key** (APIs & Services → Credentials → Create credentials → API key), restrict it to those two APIs, and store it:
   ```bash
   op item edit "GOOGLE SERVICES TOKEN" --vault "Env Variables & Secrets" "GOOGLE_API_KEY[password]=AIza..."
   ```
3. `op` (1Password CLI) installed and signed in; Node 18+.

## Safety

Read-only. Both scripts only read public performance data from Google — they never write anything. Quotas are generous (PSI 25k/day, CrUX 150/min) but `pagespeed-audit.mjs` runs a full Lighthouse audit per call, so audit focused URLs rather than crawling a whole site. For audit evidence, save output under `docs/sources/raw/pagespeed-<date>.json` (create the directory if it does not exist).
