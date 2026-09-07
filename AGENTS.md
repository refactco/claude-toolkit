# Refact Toolkit

Use simple English, short sentences, and common words. Keep exact commands and
file names accurate. Explain a required technical term in plain English.

This repository is a plugin marketplace for Claude Code and Codex. It has nine
packs under `plugins/`, with shared skills and helper files. It is not a web app.

## Source files

- Edit each skill once in `plugins/<pack>/skills/<name>/SKILL.md`.
- Keep its `name` equal to its folder name. Preserve the project's custom
  workflow metadata; the native loaders use `name` and `description`.
- Every skill links to its pack's `references/plugin-runtime.md`. Edit the
  common source at `shared/plugin-runtime.md`, then regenerate the copies.
- Keep support files inside the plugin root so installed copies are complete.
- Reusable agent briefs live under `plugins/<pack>/agents/`.
- This marketplace is the source of truth for skills. Do not restore old
  scaffold assumptions such as `agent/skills/`, `refact:sync`, or `.cursor` adapters.
- Keep `next_skills` links within the same pack. Cross-pack workflows must check
  whether the needed skill is available in the current task.
- `.refact-os.json` holds optional project structure and stack information.
  Keep secrets in the project's environment or credential store.
- Claude hooks are declared explicitly in `.claude-plugin/plugin.json` and live
  at `hooks/claude-hooks.json`. Do not add a default `hooks/hooks.json`: Codex
  would load it too. Claude language servers remain in `.lsp.json`.

## Releases and generated files

The version in each pack's `.claude-plugin/plugin.json` is the version source.
Bump changed packs and the Claude marketplace's top-level version for a release.
Run `node scripts/sync-codex.mjs` to sync catalog versions, native Codex manifests,
the Codex marketplace, and shared runtime copies. Commit those generated files
so installation from Git needs no build step. Do not edit them independently.

Native manifests live at `plugins/<pack>/.codex-plugin/plugin.json`.
The root `.agents/plugins/marketplace.json` points to the same pack directories
as `.claude-plugin/marketplace.json`.

## Validation

Use a temporary Python environment and install `requirements-dev.txt`, then run:

```bash
node scripts/sync-codex.mjs --check
python scripts/check-plugins.py
node --test tests/*.test.mjs
```

For installation changes, verify catalog discovery and installation with Codex.
For project settings, test the actual skill list in a trusted project. A CLI
catalog list alone does not prove which skills a task will load.

Read `docs/codex.md` for installation, updates, and project-specific enablement.
