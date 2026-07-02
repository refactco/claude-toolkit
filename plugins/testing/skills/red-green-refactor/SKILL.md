---
name: red-green-refactor
description: Phase 2 of the TDD harness: implement one slice test-first through red→green→refactor unit cycles until its acceptance criterion is met, then commit. Unit tests only (WordPress PHPUnit via wp-env). Triggers: 'implement slice NN', 'red green refactor', 'TDD this'.
pattern: procedure
when_to_use: Implementing one slice test-first when a plan file exists in plans/. Triggers: "red green refactor", "TDD this", "implement slice NN", "work through the plan". Also invoked by the tdd orchestrator for each slice.
when_not_to_use: No plan exists yet (run tdd-plan first). Batch-implementing multiple slices at once (always work one slice at a time). Writing integration or e2e tests (this harness covers unit tests only).
next_skills: []
sub_agents: []
---

# Red-Green-Refactor — Unit-Loop TDD (Phase 2)

Develop **one slice** test-first: a failing unit test sets the next goal, the minimum code makes it pass, and a refactor-on-green cleans it up. Repeat until the slice's behaviour — its acceptance criterion — is met. This harness runs **unit tests only** (WordPress PHPUnit via wp-env); there is no automated end-to-end / browser layer.

**Read `references/red-green-refactor-philosophy.md` now** if you have not this session — it is the authoritative rulebook, and everything below is a summary of it. For detecting, setting up, and running the project's unit tooling (WordPress wp-env + PHPUnit), read `references/test-strategy.md`.

## Input

A slice plan: `plans/<feature-slug>/<NN>-<slice-slug>.md`. If the user names a slice, open that file. If no plan exists, stop and run `tdd-plan` first (or ask the user to) — **no code before a plan**. Work on exactly one slice; never batch slices.

## Setup (per slice)

1. **Read the plan.** Internalise the goal, the acceptance criterion (Given/When/Then — the definition of done), the seeded unit test list, and what's out of scope.
2. **Be on the feature branch.** The whole feature shares **one branch** — `feat/<feature-slug>` — cut from the **source branch** (the first of `stage`, `staging`, `main` that exists; see `references/test-strategy.md`). If this is the first slice, create it; if a prior slice already created it, just switch to it. **Do not cut a new branch per slice**, and never develop on the source branch itself.
3. **Detect / set up test tooling.** Identify the unit runner (WordPress: PHPUnit via `wp-env run tests-cli`, see `references/test-strategy.md`). If the test harness is absent, set it up now as part of the slice (scaffold plugin tests, polyfills, the `test:php` script) — a walking-skeleton first slice exists precisely to establish this. Note the plan's **Project directory** — the app directory (detect it from the repo, or ask the user — e.g. `apps/<name>` in a monorepo), with the plugin under `wp-content/plugins/<slug>`; test commands are scoped there via `--env-cwd` (if the path is missing in `.refact-os.json`, ask the user).

## The acceptance criterion (the "are we done" signal)

The plan's **acceptance criterion** (Given/When/Then) is the slice's definition of done, written in the user's language. It is **not** an automated test — there is no e2e layer here. It is your progress meter: the slice is done when the unit tests covering that behaviour are green and the criterion is demonstrably satisfied (verify it manually if it has a user-facing surface). Keep it in view the whole time.

## The unit loop (red → green → refactor)

Repeat per behaviour, working from the slice's acceptance criterion down to the smallest steps. Mock collaborators that don't exist yet to design their interfaces cheaply.

4. **THINK.** Pick the single smallest next behaviour that moves the slice toward its acceptance criterion. Add it to the plan's unit test list if it's new.
5. **RED.** Write one small failing unit test (~5 lines). Run it (`phpunit --filter <test>`). **Watch it fail for the right reason** and check the diagnostic is clear. If you can't articulate why it fails, you don't understand the requirement yet.
6. **GREEN.** Write the **minimum** code to pass — Fake It / hard-code a constant if you're unsure; ugliness is fine here. Run the behaviour's test plus the full plugin suite and confirm green. Implement **nothing** that no test demands.
7. **REFACTOR (only on green).** Remove duplication (especially any hard-coding from step 6), clarify names, extract collaborators — **without changing behaviour**. Re-run tests after **each** small change. If a refactor reddens the bar, **revert it — do not fix forward**. Add no new behaviour.
8. **Log it.** Append a one-line entry to the plan's "Status / progress log" (e.g. `<date> green: Renderer outputs the cart total`). Tick the unit-list checkbox.
9. **Step sizing.** Obvious Implementation when confident; Fake It when unsure; Triangulate (require a second example) before generalising. On any **unexpected red**, downshift to smaller steps and run tests more often.

Repeat 4–9 until the slice's acceptance criterion is satisfied.

## Close the slice

10. **Confirm the behaviour is complete.** Re-read the acceptance criterion against what the tests now prove. If a piece is missing, return to the loop. If it has a user-facing surface, do a quick manual check that it behaves as the criterion describes.
11. **Outer refactor.** With the **whole suite green**, clean up across the slice's scope (duplication between new and existing code, leaky abstractions, names). Re-run the full suite after each change.
12. **Full green check + commit the slice.** Run the entire plugin suite and confirm green. Then make **one commit for the slice** using Conventional Commit style, e.g. `feat(<feature-slug>): <goal> [slice NN]`. Never commit on red. (You may leave one test red in the **uncommitted** working tree as a cross-session resume marker, but never commit a red bar.)
13. **Update the plan.** Mark the Definition-of-Done boxes that are now satisfied; set the slice status toward done.

## Invariants — must hold at all times

- No production code exists without a failing unit test that you watched **fail first**.
- The bar is **green before and after every refactoring**; never refactor on red.
- **No new behaviour during a refactor** — structure only. New behaviour needs a fresh RED.
- **Done = the acceptance criterion is satisfied** and the full unit suite passes. Never trade overall correctness for local coverage.
- Eliminate duplication before closing each cycle.
- When stuck or surprised by red: **shrink the step and run the tests more.**
- **One feature branch, one commit per slice.** Don't cut a branch per slice; don't batch slices into one commit.

## Hand-off

When the slice is green and committed, tell the user it's ready. If there are more slices, move to the next one on the **same branch**. When the last slice is done, the PR into the source branch is opened by `tdd` (Phase 3). If running under `tdd`, return control to the orchestrator.
