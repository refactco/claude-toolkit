---
name: safe-production-write
description: Check the target, exact change, authorization, and competing jobs before writing production or customer-facing state. Use for live settings, direct database changes, imports, backfills, deletions, and cron changes, including approved queue actions.
pattern: procedure
when_to_use: Before a tool, script, SQL statement, import, or admin action changes live data or behavior; before enabling or disabling a production job or destructive setting.
when_not_to_use: Read-only diagnosis; local or test fixtures; drafting a PR without a live mutation; checking marketing completeness claims; verifying a fix after deployment.
next_skills: []
sub_agents: []
---

# Safe production write

Read [runtime instructions](../../references/plugin-runtime.md) before using this skill.

Prepare a concrete, reviewable change before asking for a missing decision.
Follow existing authorization. Do not ask the user to approve the same target,
records, and change again. A read-only investigation is free to proceed within
the task; a request to investigate or open a PR does not authorize a live write.

This is a procedure for the agent, not a technical access-control system.
Credentials show what a tool can do, not what the user asked it to do.

## 1. Establish the actual target

Match the requested environment to the connection that will execute the write:
site/account identifier, host or API endpoint, database/schema, and selected
project/environment. Use project configuration and a read-only identity query or
status response. A folder name, branch, default connector, or admin credential
alone does not prove that the connection is staging or production.

If the context already names the target and the tool evidence matches it,
continue without reconfirming. If it is ambiguous or conflicts, gather the
available identity evidence and ask only for the unresolved target. Do not write
to production while describing the operation as a staging test.

## 2. Prepare the smallest change and a read-only preview

Capture the current state and the exact proposed difference before execution:

- The fields/settings or record identifiers that change, with before/after state.
- The selection rule, affected count, and objects left outside the operation.
- The supported write route, rollback or recovery method, and verification query.
- Relevant follow-on effects, including publication, deletion, email, and jobs.

Use a supported dry-run/plan API, or read-only queries with the same selection
logic as the proposed write. Inspect actual selected identifiers as well as the
count. A count alone can hide selection of the wrong rows. Do not call a write
followed by `ROLLBACK` a read-only preview: triggers, external effects, or the
storage engine may prevent a complete rollback.

For settings, inspect the code or authoritative setting definition to establish
what each value means. Check the current value, resulting behavior, and the next
scheduled execution. Do not assume that a switch label's meaning or polarity is
obvious. An import request does not authorize enabling auto-unpublish, draft
deletion, or a related cron. Include only the changes needed and authorized.

For direct database changes, read [database and job checks](references/database-and-jobs.md).
Verify destructive queries against the live schema and actual object types before
presenting a final plan. Preserve private data and secrets in previews; use only
the identifiers and limited fields needed to review the change.

## 3. Match the plan to authorization

| Evidence | Action |
|---|---|
| The user explicitly requested this exact production change and the preview stays within it | Proceed with the established write route; no repeated approval question. |
| An approved queue entry identifies this exact target and operation | Verify it is approved and unchanged, then use that queue's execution route. |
| A queue entry is pending review, rejected, expired, or changed after approval | Prepare the evidence; do not execute it or bypass review with an admin route. |
| The target is unresolved, or the preview adds an unapproved destructive effect | Finish the safe preparation and ask about the concrete missing decision. |
| Only a diagnostic, code change, or PR was requested | Complete that work; do not add a live mutation. |

Direct production database writes require a reviewed preview and explicit human
authorization for that scope. Existing explicit instructions can supply that
authorization. If an established propose/approve queue owns the operation, use it;
a service-role or administrator connection is not a substitute for its approval.
Do not add a second approval layer to an already-approved unchanged queue item.

If approval is missing, present the target, change, affected objects, meaningful
effects, and recovery method together, then ask one concise question. Name the
rule requiring the decision. Do not request a broad approval before inspecting
the schema or preparing the actual change.

## 4. Check competing writers and stale state

Before an import, backfill, retry, or job change, inspect schedulers, current jobs,
queue claims, and the application's duplicate-prevention mechanism. A manual CLI
and cron can read “no record exists” at the same time and both insert one.

Use the application's existing atomic claim, lock, or unique-key operation so
only one worker owns the work. A lookup followed by insert is not sufficient.
Check the actual implementation and constraints; a dry-run flag or this skill
cannot create that guarantee. If coordination is missing, prepare a safe code or
execution plan before the live mutation. Do not silently disable a job or enable
new schedules outside the authorized scope to get around the problem.

Recheck approval state, record versions, and key preconditions immediately before
the write. If they differ from the reviewed plan, inspect and revise the plan;
do not apply a stale statement. Use transaction/conditional-write support where
available, with the same target and selection boundaries.

## 5. Execute within scope and verify

Use the established application or queue path and the smallest practical batch.
Keep the operation ID and affected record IDs. Read the resulting state using the
preview's selection logic, and compare it with the intended result. Check for
duplicates or unintended publication/deletion effects where relevant.

If a write times out or returns an uncertain response, inspect its status and
current data before retrying. Do not assume it failed. Do not blindly repeat an
import or non-idempotent operation. Stop further mutations if the state cannot
be confirmed, while continuing safe diagnosis and reporting the uncertainty.

Report what changed, the environment, the evidence checked, and any remaining
uncertainty. Distinguish “request accepted” from “saved state verified.” Use only
a recovery action supported by the current evidence and authorization; do not
claim a rollback happened without verifying it.
