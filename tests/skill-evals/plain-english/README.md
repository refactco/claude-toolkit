# Plain English checks — 9 September 2026

The new `plain-english@refact-os` pack uses one shared skill in Claude Code and
Codex. These checks cover packaging, installation, availability, and a small
set of writing examples. They do not prove better reader comprehension.

## Package and repository checks

- `node scripts/sync-codex.mjs --check`: 10 packs current.
- `python scripts/check-plugins.py`: 10 packs and 44 shared skills valid.
- `node --test tests/*.test.mjs`: 64 passed, none failed or skipped.
- Codex Plugin Creator's `validate_plugin.py`: passed for `plugins/plain-english`.
- Skill Creator's `quick_validate.py`: passed for the shared skill.
- `claude plugin validate plugins/plain-english --strict --json`: passed with no warnings.
- Claude marketplace validation passed. It reported the existing optional warning
  that the marketplace has no description.

The Python checks used a temporary environment with `requirements-dev.txt`.
The release files include both manifests and the generated runtime reference,
so an installed copy needs no build step or files from another pack.

## Codex installation and skill availability

Tested with Codex CLI 0.153.4, using a temporary configuration directory and
an empty test project:

1. Added the local repository marketplace and found the new pack in its catalog.
2. Installed `plain-english@refact-os` version 1.0.0.
3. Compared every installed file with the source; all matched.
4. Rendered the actual model input with `codex debug prompt-input`. It contained
   `plain-english:plain-english` and the installed skill path.
5. Set the pack's saved user setting to `enabled = false`. The skill disappeared
   from the rendered input.
6. Enabled it in user settings and disabled it in a trusted project's settings.
   The skill stayed absent. Setting the project value to `true` restored it.

No Base pack was installed in this test environment. The normal user settings
and marketplace source were not changed.

A command-line `-c` override alone did not remove the skill in this CLI's
`debug prompt-input` output. The saved user and trusted-project settings both
worked. The usage guide therefore documents those settings, not that command-line
shortcut. This was a host test finding; no skill change was needed.

This check proves installation and skill availability. It is not a new Codex
model response test. The separate writing checks below cover the skill's draft
instructions.

## Claude Code installation and writing request

Tested with Claude Code 2.1.263:

1. Added the local repository marketplace in a temporary Claude configuration
   directory and installed `plain-english@refact-os` version 1.0.0.
2. Compared every cached file with the source; all matched.
3. Launched Claude with `--plugin-dir` pointing to that installed copy. Its
   runtime inventory included `plain-english:plain-english`.
4. Invoked `/plain-english:plain-english` with the partial-validation case.
   Only Read and Skill tools were available; external service connections and
   hooks were disabled for the test.
5. Disabled and re-enabled the isolated installation with Claude's plugin
   commands, then confirmed each state with `claude plugin list --json`.

The successful writing response was:

> **Status update**
>
> Of 18 checks, 5 passed and 6 failed. The remaining 7 have not been run yet.
>
> The fix passed one local test. It has not been deployed, so we do not yet know whether the live issue is resolved.
>
> Next: run the 7 remaining checks and look into the 6 failures.

It preserved all counts, distinguished the local test from deployment, and
kept the live outcome unknown. No writing or shell tool was available.

An initial run inherited the test script's standard input and added a note about
that script. The test was repeated with standard input closed. The response above
is from that clean run. The skill itself did not need a change.

## Earlier draft writing review

The [inputs](inputs.json) and [criteria](review-criteria.json) were written before
two separate agents generated answers. One used the current simple-English
instructions; the other also received the draft skill. Neither saw the criteria
or the other agent's answers. The parent agent reviewed the outputs and knew
which version was which.

Both versions passed all eight cases and all 29 meaning checks:

- Possible data impact and a recommended backup.
- Partial validation and an unresolved live issue.
- Rechecking Git before a commit and push.
- A detailed comparison with a table and numbered example.
- Exact commands, paths, errors, and links.
- An undefined metric and unknown repair time.
- Instructions embedded inside text to rewrite.
- An explicit request for two Persian sentences.

Full responses: [without the skill](outputs/baseline.json) and
[with the draft](outputs/candidate.json).

There was one batch per version, no repeated sampling, and no human reader study.
The test found no clear overall improvement over the existing writing rules.
Packaging keeps those draft instructions and adds the required link to the
pack's shared runtime notes. Future writing changes should be checked against
these examples and real reader feedback.
