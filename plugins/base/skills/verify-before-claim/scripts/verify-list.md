# Verify list — confirmed vs unconfirmed

Copy this template beside the work before drafting. Every claim or edit target
gets exactly one row. Do not write a claim into client-facing output until its
row is in the **Confirmed** table. Keep the list until every row is resolved.

**Source of truth for this task:** <!-- branch / running workflow / component file / prototype-spec — confirm the branch with the user (e.g. main vs develop) -->

## Confirmed

| Claim / edit target | Source reference (file · branch · node/line) |
| --- | --- |
| | |

## Unconfirmed

| Claim / edit target | What still needs checking |
| --- | --- |
| | |

Rules recap (from SKILL.md):

- A row moves to **Confirmed** only with a concrete reference you actually read
  or grepped in the live source — never from a plan, blueprint, or memory.
- A UI target described in words is confirmed by matching a screenshot to the
  exact component, not by editing the first plausible one.
- A quote or testimonial is confirmed only as a single contiguous span from one
  source answer — never spliced from separate answers.
- On any branch change or source update, all Confirmed rows become Unconfirmed
  again until re-checked.
- Anything still Unconfirmed when drafting ends is flagged to the user
  explicitly — never stated as fact.
