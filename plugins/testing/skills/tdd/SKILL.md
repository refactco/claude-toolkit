---
name: tdd
description: TDD harness orchestrator — takes a feature from idea to a reviewable PR via the full pipeline: tdd-plan (slice + plan), red-green-refactor per slice (unit loop), one PR at the end. WordPress-focused; unit tests only. Triggers: 'build X with TDD', '/tdd this'.
pattern: orchestrator
when_to_use: The user wants to take a whole feature from idea to PR using disciplined TDD — slicing, planning, implementing slice-by-slice with unit tests, and opening one PR. Triggers: "build X with TDD", "/tdd this", "take this from idea to PR test-first", "TDD the whole thing".
when_not_to_use: The user only wants one phase — use tdd-plan for slicing/planning alone, or red-green-refactor to implement a specific slice. Don't force the full pipeline when a single phase was requested.
next_skills:
  - tdd-plan
  - red-green-refactor
sub_agents: []
---

# TDD Harness — Orchestrator

You are running an enterprise-grade Test-Driven Development harness. Your job is to take whatever the user wants built and shepherd it through three disciplined phases, **enforcing the gate between each**. You do not write feature code ad hoc; you drive the pipeline. The harness runs **unit tests only** (WordPress PHPUnit via wp-env) — there is no end-to-end / browser layer.

If you have not internalised the discipline this session, first read the philosophy reference bundled inside the `red-green-refactor` skill — the file `references/red-green-refactor-philosophy.md` within that skill's own directory. The whole harness rests on it.

## The pipeline

```
   ┌────────────┐   ┌──────────────────────┐   ┌─────────────────────┐
   │ 1. tdd-plan│ → │ 2. red-green-refactor│ → │ 3. PR               │
   │  slice +   │   │  unit red→green→     │   │ one PR: feature     │
   │  plan files│   │  refactor, per slice │   │ branch → source      │
   └────────────┘   └──────────────────────┘   └─────────────────────┘
                          ▲          │
                          └─ next slice (same branch)
```

Phases 1 and 2 are their own skills — invoke them via the **Skill** tool. Phase 3 (the PR) is handled by this orchestrator directly. Do not improvise around the phase skills — they carry the detailed discipline.

| Phase | Owner | Produces | Gate before advancing |
|---|---|---|---|
| 1 | `tdd-plan` | `plans/<feature>/` with a README index + one plan file per thin vertical slice | User has reviewed the slice list and approved the first slice |
| 2 | `red-green-refactor` | Passing unit tests + implementation for **one** slice, committed on the single feature branch; updated plan status log | The slice's acceptance criterion is met and the full unit suite passes locally |
| 3 | this orchestrator | One pull request: `feat/<feature-slug>` → the source branch | Every slice is done and committed; user has confirmed the push |

## How to run it

1. **Clarify the goal.** Restate what the user wants in one or two sentences and confirm. If it's a brand-new system with no working test harness yet, say so — phase 1 will start with a *walking skeleton* slice that stands up the wp-env PHPUnit setup.
2. **Phase 1 — plan.** Invoke `tdd-plan`. It decomposes the request into thin vertical slices and writes execution plans into `plans/`. Surface the slice list to the user and get sign-off on the first slice before coding. Slicing is the most important judgement call — do not rush it.
3. **Cut the one feature branch.** Determine the **source branch** — the first of `stage`, `staging`, `main` that exists — and cut `feat/<feature-slug>` from it (the whole feature shares this one branch). Record the source branch in the plan README; the PR targets it.

   ```bash
   for b in stage staging main; do
     if git rev-parse --verify --quiet "$b" >/dev/null || git rev-parse --verify --quiet "origin/$b" >/dev/null; then
       BASE="$b"; break
     fi
   done
   git switch -c "feat/<feature-slug>" "$BASE"   # use origin/$BASE if it's remote-only
   ```

4. **Phase 2 — develop, slice by slice.** For each approved slice, invoke `red-green-refactor`. It drives the implementation through unit-test red→green→refactor cycles until the slice's acceptance criterion is met, then makes **one commit for the slice** on the feature branch and updates the plan. Return here and repeat for the next slice **on the same branch** — do not cut a new branch.
5. **Phase 3 — PR.** Once **all** slices are done and committed, open **one** pull request from `feat/<feature-slug>` into the **source branch** you recorded. **This is outward-facing — confirm with the user before pushing.** Then:

   ```bash
   git push -u origin "feat/<feature-slug>"
   gh pr create --base "$BASE" --head "feat/<feature-slug>" \
     --title "feat(<feature-slug>): <feature title>" --body-file <body>
   ```

   Write the PR body from the feature README and the slice plans (what each slice delivered, the unit-test summary from the real run). Never force-push. Record the PR URL in the feature README.

## Gates you must enforce (do not skip)

- **No code before a plan.** If asked to start coding without a slice plan, run `tdd-plan` first (or ask the user to).
- **One branch for the whole feature.** Cut `feat/<feature-slug>` once from the source branch; build every slice on it. Never develop on the source branch, and never cut a branch per slice.
- **One commit per slice, on green only.** A slice is committed only when its acceptance criterion is met and the full unit suite passes.
- **No PR until every slice is green and committed.** The PR is opened once, at the end, into the source branch.
- **PR base = the source branch** (`stage` → `staging` → `main`, whichever the feature branch was cut from) unless the user explicitly says otherwise. Confirm before any push or PR creation. Never force-push.

## Conventions (shared across the skills)

These are the single source of truth; the phase skills restate them briefly.

- **Plans:** `plans/<feature-slug>/README.md` (index + status board) and `plans/<feature-slug>/<NN>-<slice-slug>.md` (one execution plan per slice). `<NN>` is a zero-padded order, e.g. `01`, `02`. Create `plans/<feature-slug>/` on demand if it does not exist.
- **Project directory:** the app directory (detect from the repo, or ask the user — e.g. `apps/<name>` in a monorepo); read it from `.refact-os.json` if recorded there, and if it is missing in `.refact-os.json`, ask the user. For WordPress the plugin lives under `<app-dir>/wp-content/plugins/<slug>`; `red-green-refactor` runs the wp-env PHPUnit commands scoped there (`--env-cwd`). The git branch is always cut at the repo root.
- **Source branch:** the first of `stage`, `staging`, `main` that exists. The feature branch is cut from it and the PR targets it.
- **Branch:** **one** feature branch for all slices — `feat/<feature-slug>` — cut from the source branch.
- **Commits:** one per slice, on green only. Conventional Commit style (`feat:`, `test:`, `refactor:`). Reference the slice, e.g. `feat(<feature-slug>): <slice goal> [slice NN]`.
- **Definition of done for a slice:** the acceptance criterion is met, the full unit suite passes, and the slice is committed.
- **Definition of done for the feature:** every slice committed and one PR open into the source branch.

## When the user only wants one phase

Users can invoke either phase skill directly (`/tdd-plan`, `/red-green-refactor`). Honour that — don't force the whole pipeline if they only asked for one part. This orchestrator is for "take it from idea to PR." Each phase skill is self-sufficient and explains what it expects as input.
