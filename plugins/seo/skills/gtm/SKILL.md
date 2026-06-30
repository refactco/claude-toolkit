---
name: gtm
description: Google Tag Manager toolkit — audit the live container (tags/triggers/variables) and stage edits in a workspace (create/update tags, triggers, variables). Edits are workspace-only and confirm-gated; a human publishes. No publish/delete.
pattern: procedure
when_to_use: Any task about the GTM container's configuration for the current project — auditing what tags/triggers/variables are live, confirming GA4/Google Ads tags are installed, finding the numeric ids behind a GTM-XXXX id, or staging changes to tags/triggers/variables for a human to publish.
when_not_to_use: Analytics numbers/traffic (use the ga4 skill) — GTM has no metrics, only tag config. Search data (gsc) or page speed (pagespeed). Publishing a container live or deleting entities — intentionally unsupported here; a human does those in the GTM UI.
next_skills: []
sub_agents: []
---

# Google Tag Manager (GTM)

Read-only access to the **live (published) container configuration**. Use it to
audit what's actually deployed — GTM holds *tag configuration*, not analytics
**data** (for numbers, use the `ga4` skill).

## Shared model

- **Credentials**: the 1Password item `GOOGLE SERVICES TOKEN` (vault `Env Variables & Secrets`) — the same shared token as `ga4`/`gsc`. It must carry the `tagmanager.readonly` scope, which `${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/google-login.mjs` requests.
- **Target container**: the `gtm` object in `.refact-os.json` — `{ "publicId": "GTM-XXXXXXX", "containerName": "…" }`. The Tag Manager API addresses containers by **numeric** accountId + containerId, so the scripts resolve those from `publicId` automatically (optionally cache them as `gtm.accountId`/`gtm.containerId`).
- **Scripts** live in `scripts/` and share `scripts/_shared.mjs`. Run from inside the project so `.refact-os.json` resolves.
- **Safety**: reads (list/audit) are GET-only. Edits go **only to a workspace (a draft)** via `gtm-edit.mjs`, are **confirm-gated**, and **never publish or delete** — a human publishes the workspace in the GTM UI. See "Editing the container" below.

## Pick the right script

| The task is… | Script |
|---|---|
| Connect GTM (token missing, or "insufficient scope" error) | `${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/google-login.mjs` |
| Which accounts/containers can this account see? Find numeric ids behind a GTM-XXXX | `gtm-list.mjs` |
| Audit the live container — tags, triggers, variables, GA4 wiring | `gtm-export.mjs` |
| Dump the entire raw live container version | `gtm-export.mjs --full` |
| List/create workspaces; review what's staged for publish | `gtm-workspace.mjs` |
| Create/update a tag, trigger, or variable (in a workspace) | `gtm-edit.mjs` |

## Connect (one-time)

1. **Prereqs:** enable the **Tag Manager API** in the Google Cloud project behind the OAuth client; `op` signed in; Node 18+.
2. **Access:** for **auditing**, the Google account needs **Read** on the container. For **staging edits** (`gtm-edit.mjs`) it needs **Edit** on the container (GTM → Admin → User Management, at account + container level). It does **not** need Publish — a human publishes.
3. **Login:** GTM shares the one login the `ga4` skill runs — `node ${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/google-login.mjs`. It requests the tagmanager scope, so no separate GTM login is needed. If GTM calls return "insufficient scope", re-run that login to upgrade the shared token.
4. **Verify:** `node ${CLAUDE_PLUGIN_ROOT}/skills/gtm/scripts/gtm-list.mjs` should list the container and flag the configured `GTM-…` id as accessible.

## gtm-export.mjs — the audit

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/gtm/scripts/gtm-export.mjs            # summary: counts, GA4 tags, all tags/triggers/variables
node ${CLAUDE_PLUGIN_ROOT}/skills/gtm/scripts/gtm-export.mjs --full     # raw live ContainerVersion JSON
```

The default summary surfaces:
- **counts** of tags/triggers/variables/built-ins in the live version,
- **googleIds** — every `G-`/`GT-`/`AW-`/`DC-`/`GTM-` id found across tag params,
- **ga4** — the GA4/Google-tag tags (type `googtag`/`gaawc`/`gaawe`), whether each is paused, and the measurement id it carries (cross-check against `.refact-os.json` › `ga4.measurementId`),
- **tags / triggers / variables** — name + type lists (type codes are labelled where known).

## Editing the container — `gtm-workspace.mjs` + `gtm-edit.mjs`

**Authority model — "edit only, human publishes" (this container's choice):**
- Edits land **only in a workspace** (a draft). This skill has **no publish and no delete** code path — a human reviews and publishes in the GTM UI.
- Each edit is **confirm-gated**: show the user the exact entity JSON + target workspace, get **written approval**, then pass `--confirm`. Never pass it on their behalf.
- Editing needs the `tagmanager.edit.containers` scope — re-run `${CLAUDE_PLUGIN_ROOT}/skills/ga4/scripts/google-login.mjs` if a write reports insufficient scope.

Workflow:
```bash
# 1. See the exact JSON shape of existing entities to mirror:
node ${CLAUDE_PLUGIN_ROOT}/skills/gtm/scripts/gtm-export.mjs --full
# 2. Stage an edit in a workspace (auto-uses "agent-edits"; --create-workspace to make it):
node ${CLAUDE_PLUGIN_ROOT}/skills/gtm/scripts/gtm-edit.mjs --type=variable --create-workspace \
  --data='{"name":"Const - Foo","type":"c","parameter":[{"type":"template","key":"value","value":"bar"}]}' --confirm
node ${CLAUDE_PLUGIN_ROOT}/skills/gtm/scripts/gtm-edit.mjs --type=tag --action=update --id=12 --data-file=tag.json --confirm
# 3. Review what's staged, then hand off to a human to publish:
node ${CLAUDE_PLUGIN_ROOT}/skills/gtm/scripts/gtm-workspace.mjs status --name=agent-edits
```

After staging, **tell the user the changes are in the workspace and a human must publish them in GTM** — report the workspace name and the staged changes from `gtm-workspace.mjs status`.

## Relationship to the other Google skills

- **`ga4`** — the analytics **data** the GA4 tag collects. GTM tells you *whether and how* that tag is installed; GA4 tells you *what it measured*.
- **`gsc`** — search performance. **`pagespeed`** — Core Web Vitals.

For audit evidence, save output under `docs/sources/raw/gtm-<date>.json` (create the directory if it does not exist).
