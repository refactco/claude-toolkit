---
name: ga4
description: Google Analytics 4 toolkit — pull GA4 reports (Data API, read-only) and manage GA4 configuration (Admin API — key events, custom dimensions/metrics, data streams, property settings, access). Config writes are confirm-gated.
pattern: procedure
when_to_use: Any task needing GA4 data OR configuration for the current project — traffic/acquisition/engagement/conversion reports, period comparisons, realtime users; or managing key events, custom dimensions/metrics, data streams, data retention/attribution, and property access. Also the first stop when GA4 isn't connected yet.
when_not_to_use: Search-performance data (use the gsc skill). Core Web Vitals / page speed (use the pagespeed skill). Tag/container configuration (use the gtm skill). Out of scope: interpreting findings into recommendations; deleting GA4 config (do deletes in the GA4 UI).
next_skills: []
sub_agents: []
---

# Google Analytics 4 (GA4)

Single entry point for GA4 **data**. Shares one auth + config model with the `gsc`
and `gtm` skills (same Google account, same 1Password item, same one-time login).

## Shared model

- **Credentials**: the 1Password item `GOOGLE SERVICES TOKEN` (vault `Env Variables & Secrets`) holds `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`. The refresh token is shared with `gsc`/`gtm` and must carry the `analytics.readonly` scope — `google-login.mjs` mints it.
- **Target property**: `ga4.propertyId` (numeric) in the project's `.refact-os.json`. If it is missing in `.refact-os.json`, run `ga4-metadata.mjs --list` to discover it and ask the user before writing it in.
- **Scripts** live in `scripts/` and share `scripts/_shared.mjs`. Run them from inside the project so `.refact-os.json` resolves.
- **Safety**: reporting + discovery scripts are **read-only**. Configuration writes go through `ga4-admin.mjs` and are **hard-gated behind `--confirm`** — see "Managing GA4 config" below.

## Pick the right script

| The task is… | Script |
|---|---|
| Connect GA4 (first-time, token missing, or "insufficient scope" error) | `google-login.mjs` |
| Which properties can this account see? Find the numeric property id | `ga4-metadata.mjs --list` |
| What dimensions/metrics (incl. custom) exist for this property? | `ga4-metadata.mjs` |
| Traffic / acquisition / engagement / conversions report, trends, compare, CSV | `ga4-report.mjs` |
| Active users right now (~last 30 min) | `ga4-realtime.mjs` |
| Manage config — key events, custom dims/metrics, data streams, settings, access | `ga4-admin.mjs` |

## Connect (one-time)

1. **Prereqs (Google Cloud project behind the OAuth client):** enable **Google Analytics Data API** and **Google Analytics Admin API**; ensure `http://localhost:8765/callback` is an Authorized redirect URI on the OAuth client. `op` (1Password CLI) installed and signed in; Node 18+.
2. **Access:** for **reporting**, the Google account needs at least **Viewer** on the GA4 property. For **config management** (`ga4-admin.mjs` writes) it needs **Editor** (and **Administrator** for access-binding changes). Set roles in GA4 Admin → Property Access Management.
3. **Login:** `node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/google-login.mjs` — opens the browser, writes `GOOGLE_REFRESH_TOKEN` back to 1Password. This one login also covers `gtm` and `gsc` (it requests the union of scopes), so re-running it upgrades an older gsc-only token.
4. **Verify:** `node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-metadata.mjs --list` should list the account and the property configured in `.refact-os.json`.

## ga4-report.mjs — the workhorse

Friendly aliases resolve to GA4 API names; unknown names pass through (so any raw
GA4 dimension/metric or custom field works). Default window is the trailing 28
days ending **yesterday** (avoids partial same-day data).

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-report.mjs                                  # daily sessions/users/views, 28d
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-report.mjs --dimensions=channel --metrics=sessions,conversions
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-report.mjs --dimensions=page --metrics=screenPageViews --limit=20
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-report.mjs --dimensions=country --days=90 --order=totalUsers:desc
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-report.mjs --dimensions=sourceMedium --compare              # vs prior 28d, deltas
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-report.mjs --dimensions=page --filter=page=@/blog/ --format=csv --out=blog.csv
```

- **Dimension aliases:** `date, country, city, device, browser, os, page, pageTitle, landingPage, channel, source, medium, sourceMedium, campaign, eventName`.
- **Metric aliases:** `users, sessions, pageviews, newUsers, engagedSessions, engagementRate, avgSessionDuration, bounceRate, conversions, keyEvents, events, revenue`.
- **Filters:** `--filter=name==value` (exact), `=@` (contains), `=~` (regex); comma-separated = AND.
- **`--compare`** pulls the preceding equal-length window and adds per-row deltas + `new/lost/both` status. (Can't combine with the `date` dimension.)

## Managing GA4 config — `ga4-admin.mjs`

Manages property **configuration** via the Admin API: key events (conversions),
custom dimensions, custom metrics, data streams, data retention/attribution
settings, and access bindings.

**Authority model — "edit only, human publishes" (this property's choice):**
- GA4 has **no draft/publish step** — a `create`/`update` is **live immediately**. So every write is **hard-gated behind `--confirm`**, and you **MUST** show the user exactly what will change and get their **explicit written approval in chat** before passing `--confirm`. Never pass it on their behalf.
- **No delete path exists** — deletions are intentionally unsupported; do them in the GA4 UI.
- `list`/`get` are read-only and need no confirm.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-admin.mjs list keyEvents
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-admin.mjs list customDimensions
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-admin.mjs get dataRetention
# writes (only after written approval):
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-admin.mjs create keyEvents --data='{"eventName":"generate_lead","countingMethod":"ONCE_PER_EVENT"}' --confirm
node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/ga4-admin.mjs update dataRetention --mask=eventDataRetention --data='{"eventDataRetention":"FOURTEEN_MONTHS"}' --confirm
```

- Resources: `keyEvents | customDimensions | customMetrics | dataStreams | accessBindings` (collections: `list`/`create`) and `dataRetention | attribution` (per-property singletons: `get`/`update`).
- `--data` is the Admin API resource body; run `list`/`get` first to mirror the exact field shape. `update` needs `--mask=field1,field2`.
- If a resource returns `NOT_FOUND`, retry with `--api=v1alpha` (a few resources moved between API versions).
- Writing config needs the `analytics.edit` (and `analytics.manage.users` for access) scope — re-run `google-login.mjs` if a write reports insufficient scope.

## Relationship to the other Google skills

- **`gsc`** — what people searched to find the site (clicks/impressions/position). GA4 is what they did once on it.
- **`pagespeed`** — Core Web Vitals / page speed.
- **`gtm`** — the tag *configuration* (is GA4 actually wired up, which tags fire). No metrics there.
- **Heavy/custom analysis:** if the GA4 → BigQuery export is enabled, raw event-level data can be queried directly with the connected BigQuery MCP — more powerful than the Data API for bespoke questions.

For audit evidence, save any script's JSON/CSV output under `docs/sources/raw/ga4-<date>.<ext>` (create the directory on demand if it does not exist).
