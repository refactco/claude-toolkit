---
name: ingest-input
description: Classify and save any inbound material (email, transcript, deck, file, RFP, chat) as evidence in the memory mount with the full envelope, then suggest the next move.
pattern: procedure
when_to_use: The user pastes or points at new inbound material — "here's an email from the client", "save this transcript", "a new RFP came in", "add this file".
when_not_to_use: Spawned/unattended runs — if REFACT_MEMORY_READONLY is set in your environment, do not use this skill; durable output goes in your run report / the propose→approve path. For material already under memory/evidence/ (just read it), or when the user wants curated truth updated (use update-canonical-record), or to open a ticket (use open-ticket). Live-pipeline intakes (Slack/Fathom/Gmail) are captured by the VPS automatically — this skill is for hand-delivered material. Authored content is never evidence — evidence is as-received material only.
inputs:
  - the pasted or referenced inbound material
outputs:
  - memory/evidence/YYYY-MM-DD-<type>-<slug>.md with the evidence envelope (binaries under evidence/files/)
next_skills:
  - open-ticket            # if the material implies trackable work
  - update-canonical-record # if it changes curated truth
  - process-docs           # to integrate a batch of unprocessed evidence
sub_agents: []
---

# Ingest Input

**Spawned/unattended runs: if `REFACT_MEMORY_READONLY` is set in your environment, stop — the mount is read-only for you; durable output goes in your run report / the propose→approve path.**

Capture what arrived as **evidence** *before* acting on it — agents work from saved files, not chat memory. Schema: refact-memory `memory-model.md` (§3.2 evidence, §6.2 ingest table). Requires the mount: if `memory/` is missing or dangling, run the repo's link script (`npm run link-memory` or `node scripts/link-memory.mjs` — see the First-run section in `AGENTS.md`). Your company/project slugs come from the mount path: `realpath memory` → `…/companies/<company>[/projects/<project>]`.

## Steps

1. **Classify** by the ingest table (memory-model §6.2):

   | Material | `type:` | Destination |
   |---|---|---|
   | email | `email` | `memory/evidence/YYYY-MM-DD-email-<slug>.md` |
   | call transcript | `transcript` | `memory/evidence/YYYY-MM-DD-transcript-<slug>.md` |
   | chat thread | `chat` | `memory/evidence/YYYY-MM-DD-chat-<slug>.md` |
   | deck / presentation | `deck` | entry + original under `memory/evidence/files/<yyyy-mm-dd-slug>/` |
   | RFP | `rfp` | `memory/evidence/YYYY-MM-DD-rfp-<slug>.md` |
   | any other document | `document` | entry (+ original under `files/` if binary) |
   | client-sent **site copy** | — | `memory/site-content/<page-slug>.md`, `status: received` (site-content class, not evidence) |

   Agent chat history is **not** evidence — the VPS captures sessions already.

2. **On main, then pull** — confirm the refact-memory clone is on `main` (`git -C <clone> rev-parse --abbrev-ref HEAD`; the clone root is the directory above `companies/` in the resolved mount path). Any other branch ⇒ stop and tell the human — the mount is serving branch content. Then refresh before writing: `git -C <clone> pull --rebase --autostash`. Offline or pull fails? Proceed on the existing clone and say so.
3. **Write the file** — body **verbatim** (normalize to Markdown only where the format demands it; never paraphrase), envelope on top:

   ```yaml
   ---
   id: EVD-<yyyymmdd>-<slug>
   class: evidence
   type: email
   title: "<human-readable>"
   company: <company-slug>    # the owning company
   project: <project-slug>    # omit for company-level material
   source: manual             # or email|fathom|slack if relayed from there
   received: <date it arrived>
   from: <sender>             # email: from/to; calls: participants list
   attachments:               # paths under evidence/files/, byte-identical
   processed: false           # local-workflow flag; process-docs flips it
   created: <today>
   ---
   ```

4. **Binaries land as received** — never transcode a PDF/XLSX/image to Markdown; put the bytes under `evidence/files/<yyyy-mm-dd-slug>/` and list them in `attachments:`.
5. **Lint, commit, push** on the refact-memory clone:
   - Lint before committing: `python3 <clone>/lint/envelope_lint.py` — the same check CI runs; fix what it flags (relation paths are **repo-root-relative**, `companies/…`). The clone's pre-commit hook runs it too; never bypass with `--no-verify`.
   - Stage and commit `context(<company>/<project>): ingest <slug>` under your operator's own git identity.
   - `git -C <clone> push`. Rejected (non-fast-forward)? `git -C <clone> pull --rebase --autostash`, then push once more. Still failing? Give the human the exact commands to run — never leave the commit silently local.
6. **Surface the next move** — trackable work → `open-ticket`; changed truth → `update-canonical-record`.

## Hard rules

- Evidence is written once and **never edited** — not the body, not later "cleanups". (`processed:` is the one sanctioned envelope flip, owned by process-docs.)
- One file per item; date-prefix the filename; owning company/project decides the directory — placement is project-first.
