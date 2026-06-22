---
name: ingest-input
description: Classify and save any inbound material (email, transcript, deck, file, RFP, chat) into docs/sources/raw/ with a dated filename and a small frontmatter header, then suggest the next move.
pattern: procedure
when_to_use: The user pastes or points at new inbound material — "here's an email from the client", "save this transcript", "a new RFP came in", "add this file".
when_not_to_use: For material that already lives in docs/sources/raw/ (just read it), or when the user wants curated truth updated (use update-canonical-record), or to open a ticket (use open-ticket).
inputs:
  - the pasted or referenced inbound material
outputs:
  - a dated file under docs/sources/raw/<class>/ with a 3-line header
next_skills:
  - open-ticket            # if the material implies trackable work
  - update-canonical-record # if it changes curated truth
sub_agents: []
---

# Ingest Input

The universal entry point for any material arriving from outside the codebase. Capture it as Evidence *before* acting on it — agents work from saved files, not chat memory.

## Steps

1. **Classify the input type** and pick the destination + extension:
   - email → `docs/sources/raw/email/<yyyy-mm-dd>-<slug>.email.md`
   - meeting/call transcript → `docs/sources/raw/call-transcripts/<yyyy-mm-dd>-<slug>.transcript.md`
   - agent chat history → `docs/sources/raw/agent-transcripts/` (usually synced by the hook; only save by hand if pasted)
   - document / deck / RFP / misc file → `docs/sources/raw/<yyyy-mm-dd>-<slug>.<type>.md`
2. **Write the file** with a 3-line header:
   ```yaml
   ---
   source: gmail | fathom | asana | other
   added-by: <name or "agent">
   processed: false
   ---
   ```
3. **Never edit** raw evidence after saving — it is received state.
4. **Detect the pattern** in the content (quote request, scope change, bug report, decision) and surface the relevant `next_skills` to the user.

## Hard rules

- Raw is evidence: write once, never rewrite.
- One file per item. Date-prefix the filename.
- Bucket by source class only when volume earns it; flat files under `raw/` are fine for light projects.
