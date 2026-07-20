---
name: redirect-map-applier
description: Audit and remediate WordPress internal links, redirects, trailing slashes, and canonicals from a generated URL map.
pattern: procedure
when_to_use: "internal links missing trailing slashes, broken links 404s, redirect chains, crawl budget wasted on redirects, fix canonicals, technical SEO audit remediation, redirect map, normalize internal URLs, link standardization"
when_not_to_use: "Content/metadata editorial rewrites, sitemap generation only, server TTFB tuning, or non-WordPress sites."
next_skills: []
sub_agents: []
---

Remediate WordPress SEO link/redirect issues from data, not manual URL enumeration.

## 1. Scan the site into a URL map
Run `scripts/build-url-map.js` (contract below). It crawls the target host (or reads an Ahrefs/Screaming Frog export if `--import <file>` given) and emits `url-map.json`:

```
{
  "broken":    [{ "url", "status", "linked_from": [] }],
  "redirects": [{ "from", "to", "hops", "final_status" }],
  "no_slash":  [{ "url", "expected", "linked_from": [] }],
  "canonical": [{ "url", "declared", "expected" }]
}
```
- `no_slash`: internal links resolving via a trailing-slash 301 (crawl-budget waste).
- `redirects`: chains with `hops > 1` or a fixable single hop.
- Never invents URLs; only reports what the crawl/import found.

## 2. Triage
Read `url-map.json`. Group by fix class and count each. Report counts before editing.
Split into two lanes:
- **Template/code fixes** — patterns emitted from theme/plugin code (menus, category/tag/archive links).
- **Content/DB fixes** — one-off links in post bodies or redirect table.

## 3. Fix trailing slashes at the source
For `no_slash` entries traceable to template code, append `/` in the URL-building
expression (e.g. `'/category/' ~ term.slug ~ '/'`), not per-link. Cover menu items and
settings entries via the DB fixes below. Prefer one normalization helper over scattered edits.

## 4. Collapse redirect chains
For each `redirects` entry, repoint the source link directly to `final` URL where
`final_status == 200`. Drop redundant intermediate rules. Leave external redirects noted
for the client (they recur and are out of scope).

## 5. Resolve broken links (404s)
For each `broken` entry:
- If a valid replacement exists in the map (matching slug/canonical), repoint `linked_from`.
- If no replacement, add a redirect to the closest live equivalent or flag for editorial.
- Do not delete content links silently; list unresolved ones in the summary.

## 6. Fix canonicals
For `canonical` mismatches, set the declared canonical to `expected` (self-referential,
trailing-slash-consistent). Fix in template/SEO-plugin config, not per post.

## 7. Verify and summarize
Re-run `scripts/build-url-map.js`; confirm the four arrays shrank. Output a summary:
- links normalized (template vs DB), redirect chains cleaned, 404s resolved, canonicals fixed
- unresolved/external items needing client action
- estimated crawl-budget reduction (share of crawls previously hitting redirects)

## Guardrails
- Stay within retainer hours: fix at the source pattern first, biggest counts first.
- Cite the source ticket ID in the commit message.
- Batch template edits into one commit; DB/content edits into another for easy review.
