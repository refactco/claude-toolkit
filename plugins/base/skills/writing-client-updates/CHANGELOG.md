# Changelog — base:writing-client-updates

Newest first. Written by the Skill Analyzer; verdicts are filled in by code.

## 1.2.0 — 2026-09-09 — minor — Skill Analyzer 2026-W35

**Change:** Added a pre-draft fact check that runs before the draft: confirm the recipient from project memory, state only what the source material says and mark inferences as assumptions, read the whole referenced source rather than the first claim in it, and confirm whether the client asked for the work or we found it ourselves before choosing the opening.

**Why:** Client-update drafts named contacts who do not exist, attributed unstated claims to real people, and framed internally-found work as a client request. Each one forced a redraft, three times in three sessions.

**Evidence:**
- [F-010] skill.missing-instruction · rework · base:writing-client-updates v1.1.0 | A claim was attributed to a named client contact and a workspace account was asserted, neither stated in the source. | quote: "Nina said nobody on their side has n8n access, but there **is** an account under `jordan@credaily.com` on the workspace" | fix: Confirm the recipient and every attributed claim against project memory before naming either. | credaily-website · jamalisaeed
- [F-078] skill.missing-instruction · rework · base:writing-client-updates v1.1.0 | The draft had to be rewritten after review rather than checked before presenting. | quote: "Want it tighter (it's on the long side for an Asana comment)" | fix: Run the checks before drafting, not after the first draft is shown. | stlouis-website · Saeed Jamali
- [F-081] skill.missing-instruction · rework · base:writing-client-updates v1.1.0 | An unverified finding was stated to the client as settled fact. | quote: "The mechanism is gone: no plugin, no cache, no database, no settings screen." | fix: State only what the source says; mark an inference as an assumption in the same sentence. | stlouis-website · ali-karimii
- [F-082] skill.missing-instruction · rework · base:writing-client-updates v1.1.0 | Internally-discovered work prepared for a colleague to send was framed as a client-requested update. | quote: "also prepare an internal message and tell about preload and caching so I can send it on task." | fix: Confirm who asked for the work, and who the message is really for, before choosing the opening. | stlouis-website · ali-karimii

**Collision check:** The ~120-word first-draft ceiling and the merge/deploy guard shipped in 1.1.0 are unchanged and still steps 5 and 6. The fact check is a pre-draft gate on the notes, not a section of the message, and it caps assumption marking at a few words: an unverified claim that would need a paragraph of hedging is cut instead. So it removes rewrite passes without adding length. Steps 4 and 5 of SKILL.md had run together on one line since 1.1.0; the numbering is repaired and "offer to tighten" moved to the end of the list, where it belongs in the order of work.

**Expectation:** No client update names an unconfirmed contact, states an unmarked inference as fact, or opens internally-found work as a client request.

**Verdict:** still collecting
<!-- radar:expectation id=2026-W35-base-writing-client-updates metric=findings.skill.missing-instruction baseline=3 target=1 window=4w -->

## 1.1.0 — 2026-07-29 — minor — Skill Analyzer 2026-W31

**Change:** Added a guard forbidding merge/deploy/release claims without an observed tool action and a first-draft length ceiling.

**Why:** Skill emitted a false 'merged to production' client claim when only a PR was opened; add a guard tying release-status statements to observed tool actions.

**Evidence:**
- [F-004] skill.failed · rework · base:writing-client-updates v1.6.1 | Client/Asana update claims the fix was 'Merged to stage and promoted to production' though no merge or deploy tool call ever ran — only a PR was opened into stage. Violates the skill's own 'never invent detail' rule. | quote: "Merged to stage and promoted to production." | fix: Add an instruction to writing-client-updates: never state a merge/deploy/release status unless a corresponding tool action (merge, deploy) was actually executed and observed in this session. | credaily-website/6f79362a
- [F-017] skill.rework · rework · base:writing-client-updates v1.6.1 | Skill's own principle says err on the side of shorter, but the first drafted client note was too long and had to be rewritten from scratch to cut it in half. | quote: "Shortened to about half the length, same file" | fix: Add a concrete length ceiling or word-count target to the skill so the first draft already matches the situation's complexity instead of needing a second full rewrite. | ksom-website/e5ccfbe8

**Expectation:** No client update asserts merge/deploy/release status without a corresponding executed-and-observed tool action.

**Verdict:** still collecting — week 1 of 4: findings.skill.failed 1 → 1
<!-- radar:expectation id=2026-W31-base-writing-client-updates metric=findings.skill.failed baseline=1 target=0 window=4w -->
