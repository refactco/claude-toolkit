---
name: draft-discovery-proposal
description: Draft a Refact client proposal in our discovery-first house style — a fixed-price Discovery phase that produces client-owned deliverables, followed by a build phase priced off that Discovery. Use when a new prospect needs a proposal.
pattern: procedure
when_to_use: A prospect/lead needs a proposal, SOW, or engagement pitch drafted, and you want it to follow Refact's "clarity before code" discovery-first structure and commercial framing.
when_not_to_use: An existing engagement just needs a client deliverable (use create-deliverable), a meeting agenda, or an internal-only estimate not shown to the client.
inputs:
  - what's known about the prospect — problem, intro-call notes, RFP, any evidence under docs/sources/ or pasted context
  - rough product idea / scope signals (features, integrations, user roles)
  - commercial constraints if any (budget signal, target timeline, weekly rate)
outputs:
  - a proposal draft following the Refact structure, placed in docs/deliverables/ (or docs/internal/ if still raw) with status frontmatter
next_skills: []
sub_agents: []
---

# Draft Discovery Proposal

Draft a prospect proposal in Refact's house style: **discovery-first, fixed-price front
door, client-owned deliverables, build phase priced off Discovery.** This skill is the
*how*; the fillable skeleton is [`template.md`](template.md) in this folder — copy it and
fill it, don't reinvent the structure.

## The Refact proposal stance (the ideas that make our proposals win)

These are *why our proposals win*. The **spine** — discovery-first, de-risked, client-owned
deliverables — is what makes a proposal recognisably ours; carry it whenever it fits the
deal. The rest is a menu: apply what suits the prospect, drop what doesn't. Adapt, don't
enforce.

1. **"Clarity before code"** — we sell understanding first, software second: invest in
   knowing *what to build* before writing code. *(Spine — almost always present.)*
2. **Two phases, de-risked.** Phase 1 = a small, **fixed-price Discovery**. Phase 2 =
   build, **subject to Discovery validation** — never a hard commit up front. *(Spine.)*
3. **Deliverables are yours / no lock-in.** Discovery produces artifacts any competent
   team could execute from. Saying so lowers the buyer's risk. *(Spine.)*
4. **Money-back guarantee on Discovery.** 100% back if we don't deliver what was agreed;
   the client keeps all documentation regardless. *(Use unless commercially inappropriate.)*
5. **A clickable prototype is the conversion lever.** When the build is UI-heavy, keep it
   a Discovery deliverable — it makes Phase 2 a low-friction "yes." *(Drop for non-UI work.)*
6. **Everything pre-Discovery is preliminary** — scope, timeline, cost are "subject to
   validation during Discovery." State it once in the Summary. *(Spine.)*
7. **Budget control is a feature.** Name the mechanisms (Discovery lock-in, sprint
   sign-off, change-request, overrun early-warning) when the build is sizable enough to
   warrant it. *(Scale to deal size.)*

## Required reads

- Any prospect evidence: `docs/sources/` (RFP, intro-call transcript/notes), or pasted context.
- [`template.md`](template.md) — the generalized section skeleton with per-section guidance.
- If this repo is an existing engagement, skim `docs/product/blueprint.md` for tone — but
  a *new prospect* usually has no blueprint yet; draft from the intro call / RFP instead.

## Steps

1. **Gather what's known.** Pull the prospect's problem, goals, rough scope, user roles,
   integrations, and any budget/timeline signal from evidence. List what you *don't* know —
   those become Discovery questions, not invented facts.
2. **Copy `template.md`** to your draft location (see Placement) and adapt it to the deal.
   The sections are a default running order, not a mandatory checklist — drop any that
   don't apply (e.g. no prototype for a non-UI build, no LMS row for a product without one),
   reorder freely, and add prospect-specific sections. Fill the `{{placeholders}}` you keep;
   delete guidance comments and any section you cut.
3. **Scope Phase 1 (Discovery).** The standard deliverable set (Product Requirements, MVP
   Features, User Journeys/Wireframes, Technical Architecture, Sprint-Ready Backlog,
   Roadmap, Clickable Prototype, Competitive Analysis) is a starting menu — keep what fits
   this prospect, drop what doesn't, add what's missing. Set a fixed price and a timeline
   (week-by-week if useful).
4. **Scope Phase 2 (Build) loosely.** Feature list + technical approach + a **week-range**
   estimate, all flagged "subject to Discovery validation." Don't pretend false precision.
5. **Price it.** Discovery = fixed. Build = week-range × weekly rate → a **range**, not a
   point. State the rate basis (e.g. 1 engineering week = N hours). Total = sum of ranges.
6. **Add the closing sections that fit** — Working Process, Budget Control, Guarantee,
   Next Steps are reusable boilerplate in the template. Include the ones the deal warrants
   (a tiny engagement may not need a budget-control section); adapt names/dates.
7. **Self-check for invented facts and internal contradictions.** Every number traceable;
   no committed scope the evidence doesn't support; flag any price/scope discrepancy
   explicitly rather than silently picking (a real proposal once shipped with two different
   Discovery prices — catch that).
8. **Set status frontmatter** (`draft` → `review` → `sent`) and place per Placement. Run
   `pnpm run links:check` if the repo has it.

## Placement

- Drop the draft in `docs/deliverables/` (or `docs/internal/` while still raw) with
  `status: draft` frontmatter — promote status in place, don't move the file. A proposal is
  a client-facing deliverable.

## Pricing model (house default — adjust per prospect, don't drop the shape)

- **Discovery:** single fixed price. Small enough to be an easy "try us" yes.
- **Build:** `weeks (range) × weekly rate` → a dollar **range**. Break weeks down by
  workstream (design, auth, each feature, testing/polish) so the range is defensible.
- **Always** label build pricing "subject to Discovery validation."

## Hard rules

- Never commit Phase 2 scope or price as firm — it is always contingent on Discovery.
- Never invent product facts, integrations, or user counts the evidence doesn't support;
  turn unknowns into Discovery questions.
- Surface, don't bury, any internal inconsistency (mismatched prices, dates, scope).
- The guarantee and "deliverables are yours" framing are core differentiators — reach for
  them by default, but they're guidance, not a mandate: drop them when a deal makes them
  inappropriate.

## Note on scope (global skill)

This is a **global / catalog** skill: process-not-content, reusable across every Refact
engagement, with no client-private data baked in. It is a promotion candidate — run
`contribute-skill` to upstream it to the refact-os catalog so every prospect repo gets it.
