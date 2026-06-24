# Change Log — refact-os plugin marketplace

This file is a running log of every change we make to this repo while we move the
Refact skills into the plugin marketplace. **Newest first.**

Plan: see `docs/plugin-marketplace-plan.md`.

---

## 2026-06-24

### Removed Group 1 skills (maintainer-only) from `dev-toolkit`
Deleted these four skill folders from `plugins/dev-toolkit/skills/`:

| Skill | Why removed |
|---|---|
| `release` | Cuts an npm release of the `@refactco/refact-os` package. Works only in the refact-os repo. |
| `write-update-note` | Writes a team note about refact-os releases. About refact-os itself. |
| `update-package` | Bumps/reinstalls the refact-os npm package. Needs that package in the project. |
| `contribute-skill` | Opens a pull request (a change request) to the refact-os repo's catalog. Upstream-only. |

- **Why:** these skills act on the refact-os product itself, not on a user's project. They should not ship in the plugin.
- **Result:** `dev-toolkit` went from 29 to 25 skills.
- **Scope:** Part 1 / Phase 1 of the plan. Version bump for the plugin will happen at the end of Phase 1, not now.

### Added this change log
- New file `docs/change-log.md` (this file) to track all repo changes from here on.

---

## 2026-06-23

### Added the migration plan
- New file `docs/plugin-marketplace-plan.md` — the two-part plan. Part 1: build the plugin marketplace now. Part 2: deprecate the `refact-os` npm tool later (deferred).
