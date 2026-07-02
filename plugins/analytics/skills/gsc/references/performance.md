# Search performance reports (`gsc-queries.mjs`)

Pulls Search Analytics data — clicks, impressions, CTR, position — for the property
in `.refact-os.json`, as JSON (default) or CSV. Read-only. Run from inside the project:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-queries.mjs [flags]
```

## Dimensions (`--dimension=`, comma-separated)

| Value | Breakdown |
|---|---|
| `queries` (default) | top search queries |
| `pages` | top landing pages |
| `devices` | desktop / mobile / tablet |
| `countries` | by country |
| `dates` | day-by-day (for trends) |

Combine them for cross-tabs, e.g. `--dimension=query,page` (the data for spotting
**cannibalization** — one query ranking on multiple URLs). Friendly names and raw GSC
names (`query`, `page`, `device`, `country`, `date`) are both accepted.

## Window

- `--days=N` — trailing window length (default 28), ending at today−2 (GSC lags ~2 days).
- `--start=YYYY-MM-DD --end=YYYY-MM-DD` — explicit range (both required; overrides `--days`).

## Comparison

- `--compare` — also pulls the immediately-preceding window of equal length and adds, per row, `previous`, `delta` (current − previous), and `status` = `new` | `lost` | `both`. Rows are sorted by biggest absolute clicks delta.
  - A **negative `delta.position` means the rank improved.**
  - `ctr`/`position` deltas are `null` when a row exists in only one period; `clicks`/`impressions` treat the missing side as 0.
  - Not valid with the `dates` dimension (a date row never matches across windows); pull the two ranges separately with `--start`/`--end` instead.

## Filters (combine with AND)

- `--page=<substring>` — page URL *contains*.
- `--query=<substring>` — query *contains*.
- `--country=<3-letter code>` — *equals* (e.g. `usa`).
- `--device=desktop|mobile|tablet` — *equals*.

## Search type

- `--type=web` (default) `| image | video | news | discover`.
- Discover and News have no queries, so they only accept `--dimension=` of `date`, `country`, or `page` (the script enforces this with a clear error).

## Branded split

- `--brand='<regex>'` (case-insensitive; requires a `query` dimension) tags each row with a `branded` boolean and adds a top-level `brandedSummary` totalling clicks/impressions for branded vs non-branded. Good for "brand vs non-brand traffic" in reports.

## Volume & output

- `--limit=N` — max rows per request (default 100; API cap 25000).
- `--all` — paginate past 25000 and return every row (ignores `--limit`); use for complete inventories.
- `--format=json` (default) `| csv` — CSV flattens multi-dimension and `--compare` columns.
- `--out=PATH` — write to a file instead of stdout (e.g. `--out=docs/sources/raw/gsc-2026-06-10.csv`).

## Output shape

Single dimension → each row has a flat `key`. Multiple dimensions → a `keys` object
(dimension name → value). Top level carries `site`, `dimensions`, `type`, `startDate`,
`endDate`, `filters`, `rowCount`, and (with `--compare`) a `compare` period block.

## Common recipes

```bash
# Top queries, last 28 days
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-queries.mjs

# Cannibalization: same query on multiple URLs
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-queries.mjs --dimension=query,page --limit=500

# Decay/growth: this month vs last, biggest movers first
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-queries.mjs --compare --limit=500

# Striking distance candidates (pull, then filter rows where 10 < position <= 20)
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-queries.mjs --limit=1000

# Blog section only, US mobile
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-queries.mjs --page=/blog/ --country=usa --device=mobile

# Brand vs non-brand
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-queries.mjs --brand='mybrand|my brand'

# Complete query inventory to CSV
node ${CLAUDE_PLUGIN_ROOT}/skills/gsc/scripts/gsc-queries.mjs --all --format=csv --out=docs/sources/raw/gsc-queries.csv
```

## Reading the output (quick reference — full interpretation is out of scope for this skill)

- **Striking distance**: `position` between 11 and 20 with high impressions and low CTR — page-2 results a small push can move to page 1.
- **Content decay**: `--compare` rows with `status: both` and negative `delta.clicks`, or `status: lost` (vanished entirely).
- **Cannibalization**: in a `query,page` pull, the same query appearing under more than one page.
