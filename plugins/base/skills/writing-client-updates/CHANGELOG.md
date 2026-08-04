# Changelog — base:writing-client-updates

Newest first. Written by the Skill Analyzer; verdicts are filled in by code.

## 1.1.0 — 2026-07-29 — minor — Skill Analyzer 2026-W31

**Change:** Added a guard forbidding merge/deploy/release claims without an observed tool action and a first-draft length ceiling.

**Why:** Skill emitted a false 'merged to production' client claim when only a PR was opened; add a guard tying release-status statements to observed tool actions.

**Evidence:**
- [F-004] skill.failed · rework · base:writing-client-updates v1.6.1 | Client/Asana update claims the fix was 'Merged to stage and promoted to production' though no merge or deploy tool call ever ran — only a PR was opened into stage. Violates the skill's own 'never invent detail' rule. | quote: "Merged to stage and promoted to production." | fix: Add an instruction to writing-client-updates: never state a merge/deploy/release status unless a corresponding tool action (merge, deploy) was actually executed and observed in this session. | credaily-website/6f79362a
- [F-017] skill.rework · rework · base:writing-client-updates v1.6.1 | Skill's own principle says err on the side of shorter, but the first drafted client note was too long and had to be rewritten from scratch to cut it in half. | quote: "Shortened to about half the length, same file" | fix: Add a concrete length ceiling or word-count target to the skill so the first draft already matches the situation's complexity instead of needing a second full rewrite. | ksom-website/e5ccfbe8

**Expectation:** No client update asserts merge/deploy/release status without a corresponding executed-and-observed tool action.

**Verdict:** better — findings.skill.failed fell 1 → 0, target 0, G1 held
<!-- radar:expectation id=2026-W31-base-writing-client-updates metric=findings.skill.failed baseline=1 target=0 window=4w -->
