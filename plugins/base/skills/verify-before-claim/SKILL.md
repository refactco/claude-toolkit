---
name: verify-before-claim
version: 1.0.0
description: Verify every client-facing claim or targeted edit against live source before writing it.
pattern: procedure
when_to_use: "Before finalizing docs, testimonials, or client-facing descriptions of how something works; before editing a component identified only by a text description; before mapping a UI feature or domain term to an existing data field or spec."
when_not_to_use: "Pure exploratory brainstorming with no output committed to a file, page, or client; trivial edits where the target is already unambiguously confirmed in the current turn."
next_skills: []
sub_agents: []
---

# Verify Before Claim

Follow these steps before writing any client-facing claim or making a targeted edit derived from a description.

1. **Name the source of truth first.** Identify what "live" means for this task: the specific branch (confirm with the user which branch — e.g. `main` vs `develop`), the running workflow, the actual component file, or the reference prototype/spec. If a branch was switched or code was pulled since your last check, treat all prior verification as stale.

2. **Read or grep the real source.** For each claim, locate it in the live source: grep the ACF/field definitions, code paths, workflow node structure, or spec. Do not draft from a plan, blueprint, or memory as if it were already built.

3. **For a UI target described in words, confirm the element visually.** Before editing styling based on a text description, capture or request a screenshot and match the described element to the exact component. Do not edit the first plausible component.

4. **For quotes and testimonials, verify the span.** A published quote must be a single contiguous span from one source answer. Never splice or merge sentences from separate Q&A responses or documents into one quotation.

5. **For domain-term mappings, cross-check the definition.** When mapping a UI feature or label to an existing data field, category, or pillar, confirm the term's meaning against the client's prototype/spec before building. Do not assume a synonym maps cleanly.

6. **Build a confirmed-vs-unconfirmed list.** For every claim or edit target, record: `confirmed` (found in live source, with file/branch/node reference) or `unconfirmed` (not yet located). Use scripts/verify-list.md as the template.

7. **Write only confirmed items.** Include only `confirmed` claims in the client-facing output. Do not add anything that is not actually in the source. For each remaining `unconfirmed` item, either verify it or explicitly flag it to the user rather than stating it as fact.

8. **On any branch change or source update, re-run steps 2–7** against the new state before treating the document as valid again.

## Helper

`scripts/verify-list.md` — a checklist template with two columns, Confirmed (claim + source reference: file, branch, node/line) and Unconfirmed (claim + what still needs checking). Fill it in before drafting and keep it beside the work until every row is resolved.
