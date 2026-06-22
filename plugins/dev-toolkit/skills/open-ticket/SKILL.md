---
name: open-ticket
description: Create a tracked ticket under docs/task/open/ with frontmatter, linking the source evidence that prompted it.
pattern: procedure
when_to_use: A piece of actionable work needs tracking — a client request to build something, a bug, a scoped task — and there isn't already an open ticket for it.
when_not_to_use: For closing a ticket (use close-ticket); for work small enough to finish in the same turn without tracking; or when the item is purely a pending decision needing a human's call with no actionable work yet — that belongs in docs/context/open-decisions.md as a CD-NN row with an owner, not a ticket.
inputs:
  - the source evidence file under docs/sources/raw/ (if any)
outputs:
  - docs/task/open/<yyyy-mm-dd>-<slug>.md with status frontmatter
next_skills: []
sub_agents: []
---

# Open Ticket

## Steps

1. Create `docs/task/open/<yyyy-mm-dd>-<slug>.md`.
2. Add frontmatter:
   ```yaml
   ---
   date: <yyyy-mm-dd>
   status: open
   description: <one line: what needs doing and why>
   source: <path to docs/sources/raw/... if this came from inbound material>
   ---
   ```
3. Write a short body: the ask, acceptance criteria, and any links.
4. Tell the user the ticket path.

## Notes

- One markdown file per ticket. `docs/task/open/` holds active tickets.
- Status transitions (`open → in-progress`) are frontmatter, not folder moves.
- When the ticket closes, hand off to `close-ticket`.
- **Tickets vs. open decisions.** A *pending call that needs someone's decision* lives in `docs/context/open-decisions.md` as a `CD-NN` row with an owner from `docs/context/people.md` — that file is its source of truth. A ticket tracks **actionable work**, not the decision itself. Before opening a ticket for a client request, check whether it's really a pending call: if so, record/append the `CD-NN` instead of duplicating it here.
- **They can coexist.** When work is genuinely actionable but *blocked on* or *related to* a pending call, keep the ticket and **link** its `CD-NN` rather than restating the decision in the ticket body. A `CD-NN` graduates into a ticket once it's resolved and there's something to build — link back to the resolved decision.
