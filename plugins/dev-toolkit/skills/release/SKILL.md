---
name: release
pattern: procedure
requires_approval: true
description: Cut a new @refactco/refact-os npm release — bump version + CHANGELOG, tag, and push. GitHub Actions publishes to npm automatically when the tag lands. For refact-os maintainers only; this skill is NOT shipped to consumers.
when_to_use: A change has landed on `main` worth publishing to npm (a fix/feature/template change in `lib/`, `bin/`, or `templates/`) and the user asks to "release", "publish", "cut a version", or "ship refact-os".
when_not_to_use: Editing code/templates without releasing. Updating a CONSUMER repo's refact-os — that's `npm i -D @refactco/refact-os@latest && npx refact-os init` inside the consumer, not a publish from here.
inputs:
  - the change merged on main
outputs:
  - a published npm version of @refactco/refact-os + a pushed git tag vX.Y.Z
next_skills: []
sub_agents: []
---

# Release refact-os

Publishing is **hybrid**: the maintainer bumps the version, writes the changelog, and pushes the tag locally — then GitHub Actions (`publish.yml`) picks up the tag and runs `npm publish` with provenance automatically. No manual `npm publish` or OTP required.

## Prerequisites

- The repo secret `NPM_TOKEN` is set (an npm **granular access token** scoped to `@refactco/refact-os`, publish-only). npm 2FA must be set to "Require two-factor authentication for authorization only" (not on publish) so token-based CI can publish.
- On `main`, clean working tree, up to date: `git checkout main && git pull`.
- The change you're publishing is already merged to `main`.

## Steps

1. **Pick the version.** Semver from the change: **patch** (fix), **minor** (new feature/flag), **major** (breaking). Confirm the number with the user.
2. **Bump + changelog.** Set `version` in `package.json`; add a `CHANGELOG.md` entry under the new version (what changed + any action consumers must take). Commit `chore(release): vX.Y.Z`.
3. **Dry-run.** `npm publish --dry-run` — confirm name `@refactco/refact-os`, the right version, the file list, `public access`, and **no errors**.
4. **Tag + push.** `git push origin main && git tag vX.Y.Z && git push origin vX.Y.Z`. The tag must match `package.json`.
5. **CI publishes.** GitHub Actions detects the `v*` tag, verifies it matches `package.json`, and runs `npm publish --provenance --access public`. Monitor the run at `https://github.com/refactco/refact-os/actions`.
6. **Verify.** `npm view @refactco/refact-os version` shows the new version (may lag ~1 min).
7. **Report** the published version + tag, and remind: consumers update with `npm i -D @refactco/refact-os@latest && npx refact-os init`.

## Guardrails

- Never push a tag that doesn't match `package.json` version — the CI workflow will reject it.
- Never commit, echo, or log the `NPM_TOKEN` or any secrets.
- Don't re-publish an existing version (npm refuses); bump first.
- If CI fails, check the Actions tab — common causes: expired `NPM_TOKEN`, tag/version mismatch, npm outage.
