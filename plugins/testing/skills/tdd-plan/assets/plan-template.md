# Plan templates

This file holds two templates. Copy the relevant block, fill every `<placeholder>`, and write the result into `plans/<feature-slug>/`. Delete guidance in _italic HTML comments_ from the output.

The **slice plan is the contract** shared across the harness: `red-green-refactor` executes it and ticks its status log; `tdd` records the PR URL in the feature README once every slice is done. Keep it current.

---

## TEMPLATE A — Feature index → write to `plans/<feature-slug>/README.md`

```markdown
# Feature: <Feature title>

<One-paragraph description of the outcome the user wants and who benefits.>

- **Slug:** <feature-slug>
- **Created:** <YYYY-MM-DD>
- **Status:** planning | in-progress | done
- **New system?** yes (first slice is a walking skeleton) | no
- **Project directory:** <path from the repo root where the app + its tests live. For WordPress: `apps/wordpress` (plugin under `apps/wordpress/wp-content/plugins/<slug>`). `.` only if the app is the repo root.>
- **Source branch:** <the branch the feature branch is cut from and the PR targets — the first of `stage`, `staging`, `main` that exists>
- **Feature branch:** feat/<feature-slug>  <!-- ONE branch for all slices; not one per slice -->
- **PR:** —  <!-- tdd fills this once all slices are done and the PR is opened into the source branch -->

## Slices

Develop top to bottom. One slice = one red-green-refactor pass = one commit on the feature branch.

| # | Slice | Goal (one line) | Status |
|---|-------|-----------------|--------|
| 01 | [<slice-slug>](01-<slice-slug>.md) | <what observable behaviour it delivers> | ☐ todo |
| 02 | [<slice-slug>](02-<slice-slug>.md) | <…> | ☐ todo |

<!-- Status values: ☐ todo · ◐ in-progress · ✅ done. Update the row as each slice's commit lands. -->

## Out of scope (whole feature)

- <Things explicitly NOT being built, to bound the work.>

## Notes / open questions

- <Anything the team should decide or revisit.>
```

---

## TEMPLATE B — Slice plan → write to `plans/<feature-slug>/<NN>-<slice-slug>.md`

```markdown
# Slice <NN>: <Slice title>

- **Feature:** <feature-slug>
- **Slice slug:** <slice-slug>
- **Branch:** feat/<feature-slug>  <!-- shared across all slices of this feature -->
- **Project directory:** <e.g. apps/wordpress/wp-content/plugins/<slug>>
- **Status:** ☐ todo | ◐ in-progress | ✅ done
- **Walking skeleton?** yes | no

## Goal — the minimum testable behaviour

<One or two sentences. State the single observable behaviour this slice delivers and the value it provides. If you need the word "and", split the slice.>

## INVEST check

- **Independent:** <why it can stand alone>
- **Valuable:** <the user/stakeholder-visible value>
- **Small:** <why it fits well within a day>
- **Testable:** <how "done" is verified by unit tests>

## Acceptance criterion (the definition of done)

Written in the user's language. This is the slice's **definition of done** — verified by the slice's unit tests plus a manual check. There is no automated e2e layer; state the externally observable behaviour, not an internal function.

```gherkin
Given <starting context / state>
When  <the observable trigger: e.g. the shortcode renders, the form is submitted, the hook fires>
Then  <the externally observable outcome>
And   <additional observable outcome, if any>
```

- **Observable surface:** <rendered output | saved record | shortcode/block result | REST response | admin screen behaviour>
- **How it's verified:** unit tests (`WP_UnitTestCase` via wp-env PHPUnit) + a manual check of the surface above.

## Inner loop — initial unit test list

Seed for the red-green-refactor cycles. This is a **living list** — `red-green-refactor` will add to it as design emerges. Order from simplest behaviour to most general.

- [ ] <unit behaviour 1 — e.g. "Renderer returns £0.00 for an empty cart">
- [ ] <unit behaviour 2 — e.g. "Renderer sums line items">
- [ ] <unit behaviour 3 — …>

## Out of scope for this slice (deferred)

- <Edge cases, variations, performance, and polish pushed to later slices. This is how the slice stays thin.>

## Definition of done

- [ ] Acceptance criterion met; its unit tests were seen to fail for the right reason and are now GREEN.
- [ ] All seeded unit behaviours covered; full plugin suite passes.
- [ ] Refactor pass complete (no duplication, clear names) with the bar green.
- [ ] Slice committed as a single commit on the feature branch (`feat(<feature-slug>): <goal> [slice NN]`).

<!-- The PR into the source branch is opened once per feature (after the LAST slice) by tdd, not per slice. -->

## Status / progress log

<!-- red-green-refactor appends here as it works, one line per behaviour/cycle, so the plan is an audit trail. -->

- <YYYY-MM-DD> planned.
```

---

## Filling guidance

- **Acceptance criterion first.** It is the most important field — it defines done. If you can't write a concrete Given/When/Then for an observable behaviour, the slice is too vague or horizontal; re-slice.
- **Keep the unit list short and concrete.** Three to six behaviours is typical for a thin slice. Don't try to enumerate everything — the loop discovers more.
- **Out-of-scope is load-bearing.** Explicitly deferring things is what keeps the slice small and prevents gold-plating during development.
- **One slice file per vertical slice.** If a file starts listing two unrelated behaviours, split it into two files and add a row to the README.
- **Set the project directory.** For WordPress it's the plugin path under `apps/wordpress/wp-content/plugins/<slug>`; `red-green-refactor` runs the wp-env test commands scoped there. Use `.` only when the app is the repo root. The git branch is always cut at the repo root regardless.
- **One branch, many slices.** Every slice of a feature is built and committed on the single `feat/<feature-slug>` branch. Don't cut a branch per slice.
