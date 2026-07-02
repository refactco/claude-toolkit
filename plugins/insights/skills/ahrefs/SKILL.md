---
name: ahrefs
description: Ahrefs toolkit — analyze a site's SEO data (Site Audit issues, organic keywords/content gaps, backlinks, rank tracking) and drive fixes for the issues Ahrefs detects. Read-only data; fixes land in the site code via PR.
pattern: procedure
when_to_use: Any task using Ahrefs for the current project — running/triaging a Site Audit and fixing the issues it finds, organic keyword & content-gap analysis, backlink/referring-domain analysis, or rank tracking & competitor comparison.
when_not_to_use: Google-native data — Search Console (gsc), Core Web Vitals (pagespeed), GA4 analytics (ga4), Tag Manager (gtm). Ahrefs cannot change the site — it only detects; route the actual fixes through your code workflow.
next_skills:
  - pagespeed
  - gsc
sub_agents: []
references:
  - issue-fixes
---

# Ahrefs

Ahrefs is **read-only / diagnostic**: it reports SEO data and *detects* Site Audit
issues, but every **fix lands in the site code** — in the app directory (detect it
from the repo, or ask the user — e.g. `apps/<name>` in a monorepo; Next.js or
WordPress/Yoast). Route the actual fixes through your normal code workflow (branch →
PR → verify; if a code-development pack/skill is available, use it). This skill is the
analyze half + the fix-routing playbook.

## Two ways to get data (use whichever is available)

1. **Ahrefs MCP — primary, interactive.** The `claude.ai Ahrefs` MCP is connected. Call the **`doc` tool first** for any Ahrefs tool's schema, then call the tool. No API token needed. When a response says to render with `render-data-table` / `render-scorecard` / `render-time-series-chart`, do so for the user.
2. **API scripts — headless fallback.** For cron/headless runs where the claude.ai MCP is absent, `${CLAUDE_PLUGIN_ROOT}/skills/ahrefs/scripts/ahrefs-api.mjs` (generic v3 client) and `${CLAUDE_PLUGIN_ROOT}/skills/ahrefs/scripts/ahrefs-audit.mjs` hit the Ahrefs API v3 directly, using a paid-plan token from 1Password (item `AHREFS API TOKEN`, field `AHREFS_API_TOKEN`; override the pointer in `.refact-os.json` › `ahrefs`). Read-only.

**Config:** `.refact-os.json` › `ahrefs` holds `projectId` (the Site Audit id, from the Site Audit URL `app.ahrefs.com/site-audit/<projectId>`), `target`, and the token pointer.

**Safety:** all data access is read-only. Fixes are code changes — always via your code workflow (branch + PR, never push to `main`; if a code-development pack/skill is available, use it), then re-crawl in Ahrefs to confirm the issue count dropped.

## The four areas

| Area | MCP tool(s) | API v3 endpoint | For |
|---|---|---|---|
| **Site Audit** | `site-audit-projects`, `site-audit-issues`, `site-audit-page-explorer`, `site-audit-page-content` | `site-audit/issues`, `site-audit/projects` | Health score, the issue list, and the specific URLs per issue |
| **Keywords & content** | `site-explorer-organic-keywords`, `keywords-explorer-*`, `site-explorer-organic-competitors` | `site-explorer/organic-keywords`, `keywords-explorer/*` | Rankings, content gaps, keyword opportunities → feeds the content pipeline |
| **Backlinks** | `site-explorer-all-backlinks`, `site-explorer-broken-backlinks`, `site-explorer-referring-domains`, `site-explorer-anchors` | `site-explorer/all-backlinks`, `site-explorer/referring-domains` | Link profile, new/lost links, broken inbound links, anchors |
| **Rank tracking** | `rank-tracker-overview`, `rank-tracker-competitors-overview`, `rank-tracker-serp-overview` | `rank-tracker/overview` | Tracked-keyword positions over time, SERP moves, competitors |

## The Site Audit → fix loop (the core "fix what Ahrefs detects")

1. **Pull issues.** MCP `site-audit-issues` with the configured `project_id`, or `node ${CLAUDE_PLUGIN_ROOT}/skills/ahrefs/scripts/ahrefs-audit.mjs`. Only `crawled > 0` issues are real; the rest is the catalog.
2. **Triage.** Order by importance (**Error → Warning → Notice**) then by `crawled`/`new`. Errors first; Notices are often informational.
3. **Locate affected URLs.** For an issue, use MCP `site-audit-page-explorer` (filter by the issue) / `site-audit-page-content` to list the exact pages — you can't fix without the URLs.
4. **Map issue → fix.** Read [`references/issue-fixes.md`](references/issue-fixes.md) — it maps every Ahrefs issue category to where/how it's fixed in a Next.js + WordPress repo.
5. **Fix via your code workflow.** Branch, change the app directory (detect it from the repo, or ask the user — e.g. `apps/<name>` in a monorepo), open a PR (if a code-development pack/skill is available, use it). Performance issues → load `pagespeed` to diagnose; indexability → cross-check `gsc`.
6. **Verify.** After the fix deploys, re-crawl in Ahrefs (or re-pull issues) and confirm the affected count dropped. Save evidence under `docs/sources/raw/ahrefs-<date>.json` (create the directory on demand if it is missing).
