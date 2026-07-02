# Ahrefs Site Audit issue → fix mapping (this repo)

How to fix each Ahrefs issue **category** in the site's code.

> **Stack assumption:** the fix *locations* below assume the common refact shape —
> a Next.js front end (`apps/web`) with content from WordPress/Yoast (`apps/wp`)
> via WPGraphQL, so a page's `<head>` usually comes from **Next.js metadata** built
> from WP/Yoast fields, while redirects can live in **either** half. The fix
> *concepts* (set a canonical, collapse redirect chains, fix titles, etc.) are
> universal — adapt the file locations to your actual stack. Always confirm where a
> given URL is served before fixing.

**Workflow for every fix:** get the affected URLs (MCP `site-audit-page-explorer`
filtered by the issue), fix via `code-development` (branch → PR, never push to
`main`), then re-crawl in Ahrefs to confirm the count dropped.

---

## Indexability (noindex, canonical, robots)
- **Noindex page / Noindex follow page** — confirm it's *intentional* first (staging, thank-you, paginated, or filtered pages are often deliberately noindex). If unintended: it comes from `robots` metadata in the `apps/web` route segment (`export const metadata`/`generateMetadata` → `robots: { index: true }`) or from Yoast on the WP side. Cross-check with the `gsc` skill (URL inspection) for how Google actually treats it.
- **Blocked by robots.txt** — `apps/web` robots route (`app/robots.ts`) or the WP robots output.

## Duplicates
- **Duplicate pages without canonical** — set a canonical: Next `metadata.alternates.canonical` in the route, or Yoast canonical for WP-served URLs. Decide the one true URL (usually the clean, parameterless one) and point duplicates at it.

## Redirects
- **3XX redirect / Redirect chain / Meta refresh redirect** — collapse chains so every link points at the *final* 200 URL in one hop. Redirects live in `apps/web/next.config.ts` (`redirects()`) or middleware, and on the WP side in the **Redirection** plugin. Fix the chain at the source rule, and update internal links (below) so they don't rely on the redirect at all.
- **HTTP to HTTPS redirect** — informational if the canonical is HTTPS; ensure no internal link uses `http://`.

## Links (internal)
- **Page has links to redirect** — update the link target to the final URL (in the React component / WP content) instead of the redirected one. Highest-value link fix.
- **Page has nofollow outgoing internal links** — internal links generally shouldn't be `nofollow`; remove `rel="nofollow"` on internal `<a>`/`<Link>` unless intentional.
- **Page has only one dofollow incoming internal link** — an internal-linking *opportunity*, not an error: add contextual links from related pages (e.g. from blog posts / service pages) to strengthen it.
- **Orphan page (has no incoming internal links)** — link to it from relevant pages or the nav/sitemap.

## Content (titles, headings, meta description, word count)
- **Page and SERP titles do not match** — Google rewrote the title; tighten the `<title>` (Next `metadata.title` / Yoast title) so it matches intent and isn't truncated/duplicated.
- **Title/meta description too long·short·missing·duplicate** — set per-page `metadata.title` / `metadata.description` in `apps/web`, sourced from Yoast fields where the page is WP content.
- **H1 missing / multiple H1 / H1 changed** — ensure one meaningful `<h1>` per page in the component/template.
- **Low word count / thin content** — content task (route to the content pipeline / WordPress editor), not a code fix.

## Social tags
- **Open Graph / Twitter tags missing or incomplete** — set `metadata.openGraph` and `metadata.twitter` in `apps/web` (often a shared default in the root layout plus per-page overrides).

## Images
- **Missing alt text** — add `alt` on `next/image` / `<img>` in components, and require it for WP-inserted images.
- **Image file size too large / broken image** — use `next/image` with proper sizing; fix broken `src`. Pair with the `pagespeed` skill for LCP-image work.

## Usability and performance
- **Slow page / large HTML / large page size** — diagnose with the **`pagespeed`** skill (CrUX field + Lighthouse lab), then fix in `apps/web`: image optimization, bundle/JS reduction, caching. This is where most of the current warnings sit.

## CSS / JavaScript
- **CSS/JS file size too large** — code-splitting / minification in the Next build; review large global CSS (`apps/web/src/app/globals.css`) and heavy client components.
- **CSS/JS broken / redirects / HTTPS page links to HTTP asset** — ensure asset URLs are HTTPS and resolve directly (no redirect). Usually a build-output or hardcoded-URL issue.

## Sitemaps
- **Page not in sitemap / sitemap issues** — the sitemap is generated (Next sitemap route / `next-sitemap`, or Yoast XML sitemap on WP). Ensure new routes are included and stale URLs removed. Cross-check submission with the `gsc` skill (`gsc-sitemaps.mjs`).

## External pages
- **External 4XX / External 3XX redirect / broken outgoing link** — fix or remove the outbound link in the component or WP content; for external redirects, point at the final URL.

## Localization
- **hreflang issues** — only relevant if multi-locale; set `metadata.alternates.languages` in `apps/web` if/when locales exist.

## Other
- **Pages to submit to IndexNow** — optional; can be automated later. Not a defect.
- **Structured data / schema issues** — add/fix JSON-LD in the route (`apps/web`) or via Yoast schema settings.

---

### Quick triage heuristics
- **Errors** → fix first (they block indexing/ranking). Currently **0**.
- **Warnings** → real but lower-stakes (performance, redirects, minor meta). Batch by category into one PR where possible.
- **Notices** → mostly informational (internal-link distribution, IndexNow); treat as opportunities, not defects. Don't over-engineer fixes for notices.
