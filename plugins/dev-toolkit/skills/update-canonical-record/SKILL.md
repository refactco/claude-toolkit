---
name: update-canonical-record
description: Make a surgical, cited edit to the project's canonical truth file (blueprint/proposal/spec/charter/brief) when synthesized knowledge changes.
pattern: procedure
when_to_use: New synthesized truth needs to be reflected in the canonical record — a confirmed decision, a scope change, a resolved open question.
when_not_to_use: For raw inbound material (use ingest-input) or volatile in-progress state (use docs/task/). Don't edit the canonical record from unverified evidence.
inputs:
  - the canonical record file named in docs/index.md
  - supporting evidence under docs/sources/ and entries in docs/decisions.md
outputs:
  - a surgical edit to the canonical record, with a citation to the source
next_skills: []
sub_agents: []
---

# Update Canonical Record

## Steps

1. Read `docs/index.md` to find which file is the canonical record (it varies by project: `blueprint.md`, `proposal.md`, `spec.md`, `charter.md`, `brief.md`).
2. Make the smallest edit that captures the new truth. Cite the source (evidence path, decision date, ticket).
3. If the change conflicts with existing canonical text, record the contradiction rather than silently overwriting — note both and flag for a human.
4. If this finalizes a decision, also append to `docs/decisions.md`.

## Hard rules

- Knowledge wins over evidence on conflict, but only *after* synthesis — don't promote an unverified source claim straight into the canonical record.
- Surgical edits only. Don't rewrite whole sections to make one change.
