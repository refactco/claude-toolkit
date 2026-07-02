# Sitemaps (`gsc-sitemaps.mjs`)

List, submit, or remove sitemaps for the property in `.refact-os.json`. Run from
inside the project:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-sitemaps.mjs [flags]
```

## List (default, read-only)

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-sitemaps.mjs
```

Returns every submitted sitemap with:

- `path` — the sitemap URL.
- `submitted` / `indexed` — totals across content types, plus a per-type `contents[]` breakdown (web, image, video…).
- `errors` / `warnings` — counts Google reports for that sitemap.
- `isPending` — submitted but not yet processed.
- `isSitemapsIndex` — true for a sitemap index (a sitemap of sitemaps).
- `lastSubmitted` / `lastDownloaded` — timestamps.

What to look at: **errors > 0** (broken/blocked sitemap), `isPending` stuck for a
long time, or a missing/expected sitemap not in the list at all.

Known API quirk: the `indexed` count is **always 0** — Google stopped populating
that field in the new Search Console. Don't read it as "nothing is indexed"; use
URL Inspection (see the url-inspection reference) to check actual index status.

## Submit / resubmit (WRITE — requires written user approval)

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-sitemaps.mjs --submit=https://example.com/sitemap.xml --confirm
```

Use after publishing a new sitemap, a major content launch, or a migration. Idempotent —
resubmitting a known sitemap just nudges Google to re-fetch it.

## Delete (WRITE — requires written user approval)

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-sitemaps.mjs --delete=https://example.com/old-sitemap.xml --confirm
```

Removes the sitemap from Search Console (does not touch the file on the server). Use
when retiring an old/duplicate sitemap.

## Approval gate (mandatory for writes)

`--submit` and `--delete` change Search Console state, so they are gated:

1. Show the user the exact action — the sitemap URL and whether it's a submit or delete.
2. Wait for their **explicit written approval in a chat message** ("yes, submit it", etc.). Do not infer approval from earlier context.
3. Only then re-run with `--confirm` added. The script **hard-refuses** any write that lacks `--confirm`, and you must never add `--confirm` yourself without that written approval.

## Notes

- `--submit` / `--delete` also need a token minted with the full `webmasters` scope. If you get a 403, the refresh token is read-only — re-run `gsc-login.mjs` (see the connect reference) to re-authorize. List works with either scope.
- Only one of `--submit` / `--delete` per run.
