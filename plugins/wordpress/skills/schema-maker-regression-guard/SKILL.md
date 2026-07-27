---
name: schema-maker-regression-guard
description: Gate every schema-maker change behind golden-fixture regression tests so dedup/normalization/org fixes stop churning.
pattern: procedure
when_to_use: "editing the refact-schema-maker plugin; fixing schema deduplication, list normalization, subsumed/anonymous list dropping, organization node merge/floor, or REST body param handling; a schema fix keeps getting re-patched week after week"
when_not_to_use: "changes outside schema-maker output; pure copy/CSS edits; adding a brand-new schema type with no existing behavior to protect"
next_skills: []
sub_agents: []
---

# Schema-Maker Regression Guard

Twelve fix-of-recent commits re-patched the same dedup, normalization, and org-merge logic. Every schema-maker change MUST be locked in with a golden fixture before it merges.

## Procedure

1. **Reproduce as input.** Capture the exact page/model payload that triggers the bug into `tests/fixtures/schema-maker/<case>/input.json`. Use a descriptive slug, e.g. `brain-health-fellowship-variants`, `yoast-org-floor-no-generated-org`, `rest-body-world-class-quotes`.

2. **Record expected output.** After you fix the code, save the corrected schema graph to `tests/fixtures/schema-maker/<case>/expected.json`. This is the golden file — do NOT regenerate it blindly on later failures.

3. **Add the case to the runner.** Extend `scripts/run-schema-fixtures.php` (contract below). Do not write per-case logic in prose or test code; the runner discovers cases by directory.

4. **Confirm it fails first.** Temporarily revert your fix and run the fixture; it MUST fail. Reapply the fix; it MUST pass. A test that passes both ways guards nothing.

5. **Cover the four recurring failure classes** — add or reuse a fixture for whichever the change touches:
   - **Dedup**: two identically-populated named lists; unnamed list subsumed by a larger one (prefer named, drop anonymous/subsumed).
   - **Normalization**: fallback list recovery when a chunk fails; deterministic rebuild from fallback inventory.
   - **Org merge/floor**: config org must win even when the model emits no org node; never leave Yoast's stub untouched.
   - **REST decoding**: body params with quotes/control chars must not be double-processed by `wp_unslash`; `world-class` stays intact.

6. **Gate the merge.** Ensure CI invokes the runner and blocks on any diff. No schema-maker PR merges without a passing fixture that exercises the changed path.

## scripts/run-schema-fixtures.php (contract)

- Input: none (discovers every `tests/fixtures/schema-maker/*/` dir).
- For each case: load `input.json`, run it through the plugin's public schema-build pipeline, and deep-compare the result to `expected.json`.
- Comparison is order-insensitive for graph node arrays but exact on values.
- Output: per-case `PASS`/`FAIL` line plus a unified diff on failure; exit non-zero if any case fails.
- Never writes/updates `expected.json` — regeneration is a separate, explicit `--bless` flag a human runs intentionally.

## Notes

- One case per bug class; name the slug after the symptom, not the commit.
- When a new fix-of-recent lands, first check whether an existing fixture should have caught it and tighten that fixture.
