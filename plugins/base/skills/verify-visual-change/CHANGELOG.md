# Changelog — base:verify-visual-change

Newest first. Written by the Skill Analyzer; verdicts are filled in by code.

## 1.0.0 — 2026-08-04 — minor — Skill Analyzer 2026-W32

**Change:** Added verify-visual-change skill: confirm the rendered component, then run a scripted render check before claiming a layout fix done.

**Why:** Four refact-website sessions hand-wrote Playwright measure/screenshot scripts; one edited a non-rendered component. A grep-render-check-then-screenshot skill stops guess-and-ship.

**Evidence:**
- [F-021] skill.absent · friction · (no skill) | Visual QA for the Discovery section required hand-writing a fresh Playwright screenshot script nearly every iteration, causing repeated scroll-position bugs including a crash from referencing window inside a Node eval context. | quote: "ReferenceError: window is not defined" | fix:  | refact-website/0ebd61fb
- [F-024] skill.absent · friction · (no skill) | No skill exists for verifying visual/layout changes before shipping; agent hand-wrote three separate ad-hoc Playwright scripts to measure DOM offsets and screenshot the page, after an initial guess (padding fix) turned out wrong. | quote: "Rather than guess a second time:" | fix: Add a skill that instructs agents to script a headless-browser measurement/screenshot check before claiming a CSS/layout fix is correct, instead of guessing from source alone. | refact-website/236e8512
- [F-025] skill.absent · rework · (no skill) | No skill/checklist existed to verify which component actually renders for a route before editing; agent edited a commented-out HomeClientVoicesSection through multiple rounds, requiring reverts. | quote: "I've been editing a component that isn't even rendered!" | fix: Add a skill step: before editing a UI component, grep the route's page.tsx imports to confirm the component isn't commented out or superseded by another component. | refact-website/38c0e8b2
- [F-031] skill.absent · friction · (no skill) | Agent manually rewrote 11 component files one edit at a time (dash rules, radius, surface colors) to achieve a visual redesign, an iterative trial-and-error process (repeated undo/redo on hairlines, radii, colors) that a design-system consistency skill could… | quote: "Removed the little dash rule from every eyebrow label across the homepage sections — 14 occurrences in 11 components." | fix: Add a skill that defines and applies shared design tokens (radius, hairline, surface) across flexible/Home* components in one pass instead of iterative manual edits. | refact-website/e2500479

**Expectation:** Layout/CSS fixes are verified with a scripted render check before claiming done, cutting hand-built visual-QA sessions.

**Verdict:** still collecting
<!-- radar:expectation id=2026-W32-base-verify-visual-change metric=findings.skill.absent baseline=19 target=14 window=4w -->
