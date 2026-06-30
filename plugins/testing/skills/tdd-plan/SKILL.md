---
name: tdd-plan
description: Phase 1 of the TDD harness: decompose a feature into thin vertical slices and write a markdown execution plan per slice into plans/. Each plan is the contract red-green-refactor executes. Triggers: 'slice this up', 'plan this test-first', 'write a TDD plan'.
pattern: procedure
when_to_use: At the start of any feature, bugfix, or change — before writing code — when you need to identify thin vertical slices and produce execution plans. Triggers: "slice this up", "what is the smallest first step", "plan this test-first", "write a TDD plan", "plan before coding".
when_not_to_use: A plan already exists in plans/ and you are ready to implement a slice — go directly to red-green-refactor instead.
next_skills:
  - red-green-refactor
sub_agents: []
---

# TDD Plan — Slice & Plan (Phase 1)

Turn a request into a set of **thin vertical slices**, each captured as a markdown execution plan in `plans/`. A good slice is the smallest change in system behaviour that is independently valuable and verifiable through tests. The plan you write here is the contract the `red-green-refactor` skill executes next — so make it precise.

**Slicing is the hardest and most valuable judgement in TDD.** "Sequencing the tests properly is a skill — pick tests that drive you quickly to the salient points in the design." Take your time here.

For the full slicing toolkit — vertical-vs-horizontal, INVEST, the walking skeleton, and nine concrete splitting patterns with a worked example — read `references/slicing-guide.md`.

## Procedure

1. **Understand the request.** Restate the feature/outcome in one or two sentences. Ask only the questions that change the slicing: who the user is, the externally observable behaviour, the boundary it goes through (web UI, HTTP API, CLI), and any hard constraints. Don't over-interrogate.

2. **Detect the context.** Is this a brand-new system or a change to an existing one? First find the app directory — detect it from the repo, or read the project structure from `.refact-os.json`; if it is missing there, ask the user (e.g. `apps/<name>` in a monorepo, or `.` for a single app at the repo root). Then, to decide walking-skeleton vs. existing harness, check **exactly one path** — does `<app-dir>/tests/Unit/` exist? That single check is the whole detection step. **Do not `cd` through plugin/theme directories or enumerate `wp-content/plugins/*` looking for a `tests/` folder** — there is one tests directory and it is at the WordPress project root. If there is **no working unit-test path yet** (that directory is absent), the first slice must be a **walking skeleton**: the thinnest thread that builds, runs, and is covered by one passing unit test through the real test harness — for WordPress, that means standing up the wp-env PHPUnit setup (scaffold plugin tests, polyfills, the `test:php` script) before any real feature content.

   Record **where the app lives** relative to the repo root — the *project directory* you detected above, with the plugin under test at `<app-dir>/wp-content/plugins/<slug>/`; use `.` only for a single app at the repo root. Record it in every plan (see the template field): `red-green-refactor` runs the wp-env test commands scoped there. The git branch is always cut at the repo root regardless.

3. **Slice vertically.** Decompose into an ordered list of slices, each cutting through all the layers it needs (UI → logic → persistence) to deliver one observable behaviour. **Never slice horizontally** (a "build the DB layer" slice has no independent value and can't be tested end-to-end — reject it). Use the splitting patterns in the guide. Order slices so the earliest ones de-risk the most and each builds on the last.

4. **Validate every slice against INVEST** — Independent, Negotiable, Valuable, Estimable, Small, Testable. If a slice isn't Small and Testable, split it again. If it has no discernible value, drop it. Aim for slices a developer could finish in well under a day.

5. **Write the plans.** Create `plans/<feature-slug>/` (create the `plans/` directory on demand if it does not exist):
   - A `README.md` index/status board from the **Feature index template** in `assets/plan-template.md`, listing all slices in order with status.
   - One `<NN>-<slice-slug>.md` execution plan per slice from the **Slice plan template** in the same file. `<NN>` is the zero-padded order (`01`, `02`, …).
   - Fill in every section. The crucial ones: the **acceptance criterion** written as a Given/When/Then that defines "done" for the slice (verified by its unit tests plus a manual check — there is no automated e2e layer), and the **initial unit test list** that seeds the loop. These don't have to be exhaustive — the test list is living and `red-green-refactor` will add to it — but they must pin down "done".

6. **Confirm and hand off.** Show the user the slice list (titles + one-line goals + the proposed first slice). Get sign-off before any code is written. Then tell them the next step: run `red-green-refactor` on slice `01`. If they're using the `tdd` orchestrator, return control to it.

## What makes a plan good

- **One behaviour per slice.** If you can't state the slice's value in a single sentence, it's too big.
- **The acceptance criterion is concrete and observable** — it states the externally visible behaviour the slice delivers (a rendered output, a saved record, a shortcode result), not an internal function call.
- **Out-of-scope is explicit.** Listing what a slice deliberately defers is how you keep it thin and stop gold-plating.
- **The plan is executable by someone else.** The `red-green-refactor` skill should be able to start solely from the plan file.

## Output

Plans only. Do not write production or test code in this phase — that is `red-green-refactor`'s job. The deliverable is `plans/<feature-slug>/` populated with a README index and one plan per slice, plus a short summary to the user of the slices and the recommended first one.
