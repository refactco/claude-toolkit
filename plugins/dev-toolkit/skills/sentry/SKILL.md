---
name: sentry
description: Triage a Sentry backlog — pull and aggregate unresolved issues, split ours vs third-party, pinpoint root causes from event stack frames, and mute/resolve to reclaim quota.
pattern: procedure
when_to_use: A task asks to review/clean up Sentry logs, "check the Sentry errors", fix warnings, or stop Sentry filling its quota. Also when investigating a specific Sentry issue's root cause.
when_not_to_use: Setting up the Sentry SDK/DSN in an app for the first time (that's app config, not triage). Reading non-Sentry logs (server/PHP error logs) — use the host's log tooling.
next_skills:
  - git-workflow
sub_agents: []
---

# Sentry Triage

Use this when a ticket says something like "review the Sentry logs and fix what we can,
ignore what we can't so it doesn't fill our quota." The job has three moves: **inventory**
(what's firing and how much), **fix what's ours**, and **mute what isn't** so the quota
stops burning.

The script `agent/scripts/sentry.mjs` does all the API calls, aggregation, and
classification — you interpret its output and write the fixes. Don't enumerate issues by
hand.

---

## Prerequisites

| Requirement | Where it lives | Failure mode |
|---|---|---|
| Org + project slug | `.refact-os.json` → `sentry.org`, `sentry.project` | Missing → script tells you which to set. Org slug is the `…/organizations/<slug>/` part of the dashboard URL. |
| "Ours" path patterns | `.refact-os.json` → `sentry.ownPaths` (array of substrings) | Empty → the ours-vs-third-party split is skipped (everything "unknown"). Set it to the dirs your team maintains, e.g. `["wp-content/themes/acme", "wp-content/mu-plugins/acme"]` or `["apps/web/src"]`. |
| Auth token | `SENTRY_TOKEN` in `.env`, or the `SENTRY_TOKEN` field of a 1Password item (default title `SENTRY TOKEN`, override per-project via `sentry.tokenItem`) | Can't resolve → script prints why; set up `op` via `sync-env-vars`, or paste a token into `.env`. |

Config block:

```json
{
  "sentry": {
    "org": "my-org-slug",
    "project": "my-project-slug",
    "host": "https://my-org-slug.sentry.io",
    "tokenItem": "MyProjectSentryToken",
    "ownPaths": ["wp-content/themes/acme", "wp-content/mu-plugins/acme"]
  }
}
```

### Token (read it, don't store it)

Create a **User Auth Token** at `<host>/settings/account/api/auth-tokens/`. Scopes:
`org:read`, `project:read`, `event:read` — add `event:write` only if you'll `mute`/`resolve`
from the CLI. The token is a secret: never echo it into chat or a PR, and tell the user to
**revoke it when the triage is done**.

---

## How to invoke

```bash
# Inventory: unresolved issues, aggregated by source, ours-vs-third-party split
node agent/scripts/sentry.mjs issues
node agent/scripts/sentry.mjs issues --env production --period 14d --limit 100
node agent/scripts/sentry.mjs issues --json            # machine-readable

# Drill into one issue: latest-event stack frames + captured vars
node agent/scripts/sentry.mjs issue PROJECT-123

# Reclaim quota (needs event:write)
node agent/scripts/sentry.mjs mute 1234567890 1234567891
node agent/scripts/sentry.mjs resolve 1234567892
```

`--period` only accepts `24h` or `14d` (Sentry's issues API rejects longer windows);
actively-recurring issues still surface because their last-seen is recent.

---

## Workflow

1. **Inventory.** Run `issues`. Read the BY SOURCE table and the OURS list. Note the total
   event volume and which sources dominate — the quota concern is almost always a few
   high-volume third-party signatures.
2. **Separate ours from third-party.** The OURS list (driven by `sentry.ownPaths`) is what
   you can actually fix. Watch for issues *anchored* to your files but rooted in the
   framework/core — `issue <id>` reveals whether the deepest frame is really yours
   (marked `<= OURS`) or just the entry point.
3. **Fix what's ours.** For each OURS issue, `issue <id>` to get the stack frames + captured
   vars, find the root cause, and make the change. Hand off to `git-workflow` to branch,
   commit, and open the PR.
4. **Verify.** Prefer reproducing the exact failing input over eyeballing — e.g. render the
   template/function with the values from the event's `VARS` and confirm the warning is
   gone (a framework's CLI, like `wp eval-file` on a WordPress host, is ideal). Then watch
   the issue in Sentry: after deploy, its last-seen should stop advancing.
5. **Mute the rest.** Third-party warnings you can't fix: `mute` them. But muting one-by-one
   loses to noise that fragments into many issues — prefer a **source-level filter** in the
   SDK (drop vendor `E_WARNING`/`E_NOTICE`, keep your own + real errors) when the platform
   supports it. Call that out as the durable quota fix.
6. **Report.** Summarize: total volume, third-party vs ours, and for each fixed issue a one-
   line "what it was / how we fixed it." Keep it human — see `writing-client-updates`.

---

## Guardrails

- **Never commit the token or echo it into chat/PRs.** Remind the user to revoke it when done.
- `mute`/`resolve` change live Sentry state — confirm the id list with the user first, and
  only after a fix is shipped (or the issue is genuinely junk).
- The script reads `count` and other numeric fields that the Sentry API returns as strings —
  it already coerces them; don't re-sum raw API JSON by hand.
- An issue's "culprit" file is only the **in-app anchor frame**. Don't assume it's the bug
  site — confirm with `issue <id>` before editing a file that may just be the entry point.
- `401` = bad/expired token; `403` = token missing a scope or project access.
