# Coverage Deepening — the detail behind step 8

The depth pass that runs **after** the Generated suite is green and `COVERAGE.md` is fully dispositioned. The ledger proves **breadth** (every observable *surface* was dispositioned); coverage proves **depth** (which *lines/branches* actually executed). This pass exists to catch the one thing the surface inventory structurally cannot: a `✅` surface pinned only on its happy path, and any region reachable from no public surface at all (dead code).

It is bounded on purpose — **at most two coverage runs, ever** — because a green suite already over a dispositioned ledger is the safety net; this only sharpens it.

## 1. Run coverage exactly once

`npm run test:php:coverage` (step 1's script) enables wp-env's bundled Xdebug coverage driver and emits three reports: `--coverage-text` (stdout %), `--coverage-html` (`tests/coverage-html/`), and Clover `--coverage-clover` (`tests/coverage.xml`). There is **nothing to install** — the driver ships with wp-env; only the `--xdebug=coverage` start flag is needed, which the script supplies. Coverage mode slows the suite; `npx wp-env start` (no flag) returns it to fast mode afterwards.

## 2. Reconcile the coverage scope first

Before trusting any number, reconcile `phpunit.xml.dist`'s `<coverage><include>` with the confirmed scan list (step 3): it must list every maintained plugin/theme folder (single-file plugins via `<file>`) and **nothing else**.

- Covers core/vendor → the % is meaningless.
- Omits a maintained folder → that folder's gaps are invisible.
- **Theme → scope to its logic dirs only** (`functions.php`, `inc/`, `lib/`), never the whole theme directory. Under `processUncoveredFiles="true"` PHPUnit *loads* every included file to measure it, and a theme's template/view files (`header.php`, `page-*.php`, …) fatal when loaded standalone because they call parent-theme/plugin globals. **A coverage run that dies with a fatal inside a template file is this misconfiguration, not a test failure.**

## 3. Triage `coverage.xml` in a sub-agent — never read it inline

A multi-folder Clover file is large; parsing it in the orchestrator context is the step's main token cost. Delegate it (the `Agent` tool). Hand the sub-agent the ledger's `✅` rows and `coverage.xml`. It returns a **compact candidate list** — and nothing else:

- For each `✅` surface with `count="0"` lines carrying real behaviour: one row — `surface · file:line · the unexecuted branch in a phrase` (e.g. "empty-cart path never runs").
- Separately, any `count="0"` region **reachable from no public surface at all** — a dead-code signal the inventory structurally can't find.

It does **not** rank the whole codebase by coverage %. A low number on a file that's mostly `⚪`/`⛔`/`🔌` is *already explained* by the ledger — re-triaging it is wasted work. The only signal strictly new over the ledger is a missed branch under a `✅`.

## 4. Gate — surface, then ask before writing

Surfacing the candidates is the safety signal and happens **every run**. *Writing* the branch tests is opt-in. Show the user the `--coverage-text` per-file and total line % alongside the ledger roll-up, then the shallow-`✅` list and any dead-code flags. Then **stop and ask** (recommended answer first) and **wait** — keep this gate's todo `in_progress` until they answer:

> **Do you want to continue implementing the extra tests?**
> - **Yes, implement tests.** *(recommended)* — write the missing-branch tests for the shallow `✅` surfaces.
> - **No** — record them as-is and finish.

By this point the run has spent a lot of tokens; making the deepening an explicit choice is the stop, not a vibe.

## 5. On accept — one bounded pass, two coverage runs max

Re-enter step 5's mechanism: dispatch a generation sub-agent per affected folder, handing it the shallow-`✅` candidates as its worklist. It **adds tests under the existing `✅` surface; it opens no new `🔲` rows.** If a branch test reveals the path needs a **complex** dep or has **no seam**, the sub-agent re-dispositions that row (`🔌`/`⛔`, named) instead of forcing a test. Then run coverage **one more time** to record the new state.

**That is the cap: at most two coverage runs — no third.** Anything still uncovered after the second run gets a disposition or an annotation — never another loop, never an ignored red line, and **never a test written just to turn a line green** (that yields contrived, assertion-thin tests, the opposite of a safety net).

## 6. On decline — annotate in place

Annotate each shallow row where it sits: `✅ covered (happy-path only — <branch> left, user-deferred)`. Nothing further runs; go to step 9.

## 7. Record depth on the row, not as new rows

A pinned branch annotates its existing `✅` row (`✅ covered (branches pinned: error+empty)`); a branch deliberately left annotates it too. Branches are derived from the gitignored `coverage.xml` and re-derived on every run, so the durable, resumable thing is the **decision recorded on the row** — not a branch enumeration in the ledger. This operationalizes `characterization-tests.md` §4 ("exhaustive at the surface level, not the branch level"): coverage *shows* which load-bearing branch deserves a second pass instead of you guessing — but the ledger stays the gate, surface-level.

## 8. Artefacts are never committed

The HTML report (`tests/coverage-html/`) and Clover XML (`tests/coverage.xml`) are build artefacts — gitignored at setup (step 1), never committed. Sub-100% line coverage is expected, not a failure: this skill is exhaustive at the surface level, not the branch level. Append `Unit/Generated` to the phpunit command to isolate the backfill suite's own contribution if the project also has pre-existing tests.
