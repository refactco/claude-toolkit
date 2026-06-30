# Context Boundary Spec

> Where each kind of project context lives, who owns it, and how the two homes
> connect. Goal: **one fact, one home, linked — never copied.**

## The rule (one line)

**If a coding agent needs it to change code, or it is a project decision / risk /
blueprint → it lives in the REPO. If the brain or a human needs it to manage the
relationship or see across projects → it lives in REFACT CONTROL. Never store the
same fact in both. Link instead.**

## Who owns what

| Kind of context | Examples | Source of truth | The other side may… |
|---|---|---|---|
| **Code & technical** | setup, deploy, infra, plugins, stack, how a feature is built | **Repo** — `README.md`, `agent/AGENTS.md`, `docs/context/*` | link to the repo |
| **Project registers** | decisions, risks, open questions, blueprint / spec | **Repo** — `docs/decisions.md` (`DEC-NNN`), `docs/registers/*`, `docs/product/*` | reference a `DEC-NNN` by id |
| **Engagement evidence** | transcripts, emails, proposals, decks | **Repo** — `docs/sources/`, `docs/meetings/` | — |
| **Relationship / account** | key people, how they work, politics, payment patterns | **Refact Control** — client `context_entries` | repo links to Control |
| **Cross-project timeline & rollup** | deliveries, milestones, status across clients | **Refact Control** — project `context_entries` | — |
| **Routing / CRM** | client ↔ project ↔ repo map, channels, contacts | **Refact Control** — records tables | — |

## Source of truth shifts with the project phase

- **Discovery / build** (e.g. SA Partners): the **repo leads**. The blueprint and the
  `DEC-NNN` register are the system of record. Control holds a thin index + a link —
  never a re-summary of the decisions.
- **Ongoing support** (e.g. KSOM): **Control leads** for relationship and timeline.
  The repo holds only code / technical context. The repo must **not** keep a parallel
  client brief.

## Two failures to avoid

1. **Duplication (the KSOM trap).** A `client.md` in the repo that repeats the client
   brief already held in Control. → Two copies, silent drift, wrong-but-trusted.
   **Fix:** one home; the other side links.
2. **Lossy shadow (the SA Partners trap).** Control re-summarises the repo's 51
   decisions into 5 vague (and mis-dated) entries. → The central copy is worse and
   wrong. **Fix:** Control references `DEC-NNN`; it never restates the decision.

## Link, don't copy

- Reference by **stable id or URL**: a Control entry links to `DEC-031`; a repo file
  links to the Control project URL.
- **One-way only:** each fact has exactly one editable home; the other side is a pointer.
- Deep reads happen **on demand** (MCP / a query tool), not by copying long files around.

## 10-second decision test

> "If this fact changed, who edits it — and who else only needs to read it?"

- Edited by a **developer / about the code or product** → repo.
- Edited by a **PM / about the client or across projects** → Refact Control.
- Tempted to put it in both? → pick the editor's home; make the other a **link**.

## Guardrails (must hold before Control can be trusted as a source of truth)

- **No silent drops.** Standing `note` context must always reach the brain (fix the
  40-row fetch / 30-row cap so standing notes are never pushed out by dated entries).
- **No fabricated dates.** Entry dates must match the source evidence (the
  date-hallucination bug). A central store you cannot trust is worse than a repo file
  you can.
