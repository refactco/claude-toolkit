# URL Inspection (`gsc-inspect.mjs`)

Google's index status for specific URLs — the API behind the "URL Inspection" panel
in Search Console. Read-only. Run from inside the project:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-inspect.mjs --url=https://example.com/pricing
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-inspect.mjs --urls-file=urls.txt
```

The inspected URL(s) must belong to the property in `.refact-os.json`.

## Flags

- `--url=URL` — inspect a single URL.
- `--urls-file=PATH` — inspect every URL in a file (one per line; blank lines and `#` comments ignored).
- `--lang=CODE` — BCP-47 language for human-readable messages (default `en-US`).

## What it returns (per URL)

| Field | Meaning |
|---|---|
| `verdict` | `PASS` / `NEUTRAL` / `FAIL` — overall index verdict |
| `coverageState` | e.g. "Submitted and indexed", "Crawled - currently not indexed", "Discovered - currently not indexed" |
| `robotsTxtState` | `ALLOWED` / `DISALLOWED` |
| `indexingState` | `INDEXING_ALLOWED` / `BLOCKED_BY_META_TAG` / … |
| `pageFetchState` | `SUCCESSFUL` / `SOFT_404` / `NOT_FOUND` / `REDIRECT_ERROR` / … |
| `lastCrawlTime` | when Google last crawled it |
| `crawledAs` | `MOBILE` / `DESKTOP` |
| `googleCanonical` vs `userCanonical` | the canonical Google chose vs the one you declared — a mismatch is a common indexing problem |
| `sitemaps` / `referringUrls` | sitemaps and internal links Google associates with the URL |
| `mobileUsability` | mobile-usability verdict |
| `richResults` | structured-data / rich-results verdict |
| `inspectionResultLink` | deep link into the GSC UI |

## When to use it

- Confirm a page is actually indexed (not just published).
- Diagnose "why isn't this ranking" — `coverageState` of "Crawled/Discovered - currently not indexed", a canonical mismatch, or `robotsTxtState: DISALLOWED`.
- Verify a fix took effect — re-inspect after changes and check `lastCrawlTime` advanced and the verdict flipped to `PASS`.
- Spot-check a migration or a batch of new pages.

## Recipe: find indexing issues across many pages (404s, not-indexed, undiscovered)

GSC has **no API for the aggregate "Pages" indexing report**, so you can't download
Google's ready-made issue list — you reproduce it by inspecting a URL inventory:

1. Build the URL list — extract `<loc>` values from the live sitemap
   (`curl -s https://example.com/sitemap.xml | grep -o '<loc>[^<]*'`), or take pages
   from a performance pull.
2. Run `gsc-inspect.mjs --urls-file=...` over it.
3. Bucket results by `coverageState`:
   - "Submitted and indexed" — healthy.
   - "Crawled - currently not indexed" / "Discovered - currently not indexed" — real
     indexing issues to investigate (quality/duplication/internal links).
   - "Not found (404)" / `pageFetchState: NOT_FOUND` or `SOFT_404` — Google crawled
     it and recorded the error.
   - "URL is unknown to Google" — Google never crawled it (new page, orphan, or a
     dead URL Google never met).

**404 nuance:** inspection reports *Google's recorded view*, not a live fetch — a
dead URL Google never crawled comes back "unknown", not "404". For live 404
checking, pair the inspection with a plain HTTP status check
(`curl -s -o /dev/null -w '%{http_code}' <url>`): HTTP tells you what's broken
*now*; inspection tells you what Google *knows about*.

## Quota & batching

The API allows ~**2000 inspections/day** and ~**600/min** per property. The script
paces batch requests (~150ms apart) to stay well under the rate cap. Feed it a
**focused list** — e.g. the pages a performance report or sitemap audit flagged —
not a whole-site crawl. A good pattern: pull `--dimension=pages` from a performance
report, take the URLs of interest, and pass them via `--urls-file`.
