---
name: update-package
description: Update/bump/reinstall the refact-os package from npm, refresh the agent payload (prune removed skills, regenerate adapters), report what changed, and surface newly-available capability packs.
pattern: procedure
when_to_use: /refact update the package | bump refact-os | reinstall | "get the latest refact-os" | "are we on the latest standard".
when_not_to_use: Installing WordPress agent skills (use install-wp-skills). Bringing a drifted repo fully in line (after updating, use adopt).
next_skills: []
sub_agents: []
---

# Update Package Reference

Use this when the user asks to update / bump / refresh / reinstall `refact-os` in the current repo. Goal: pull the latest package, let it refresh the agent payload, and report what changed — including anything that needs a manual merge.

## Source

`refact-os` is published to npm as **`@refactco/refact-os`** (scoped public). Install it from npm unless the user explicitly names a local checkout (e.g. `../refact-os` for development). The binary it provides is still `refact-os`, so the `refact:*` npm scripts are unchanged.

## Workflow

1. **Detect the package manager** from lockfiles: `pnpm-lock.yaml` → pnpm; `yarn.lock` → yarn; `package-lock.json` or none → npm.
2. **Bump the package** (show the command first; let the user override the source):
   - npm: `npm install -D @refactco/refact-os@latest`
   - pnpm: `pnpm add -D @refactco/refact-os@latest`
   - yarn: `yarn add -D @refactco/refact-os@latest`

   Installing does **not** scaffold anything (there is no postinstall), so apply the refresh explicitly in the next step.
3. **Refresh the payload:** `npx refact-os init` (or `npm run refact:update`). It is idempotent and:
   - force-copies package-managed files (the `agent/` skills, hooks, scripts, root pointers); your own files are preserved (`agent/AGENTS.md`, `README.md`, everything under `docs/`).
   - **prunes** skills the package removed or renamed since your last update (tracked via `_scaffold.shippedSkills` in `.refact-os.json`); skills you authored are never pruned.
   - regenerates `.cursor/` and `.claude/` from `agent/`.
   - prints the version transition (`old → new`) and any pruned skills.
4. **Read the output** and surface to the user:
   - the version transition — point them at `node_modules/@refactco/refact-os/CHANGELOG.md` for what changed and whether anything needs manual action.
   - any pruned skills.
   - **newly-available packs** — after a version jump, run `node agent/scripts/list-skills.mjs` and surface any catalog packs the repo doesn't have yet that fit its stack or work, recommending `get-skill <pack>` for those. A new version can add packs; this is the "you moved old → new — here's what's newly available to consider" nudge. (Gotten packs are preserved across the update; this only flags ones you don't have.)
   - the **`agent/AGENTS.md` drift warning** if it fired (the upstream contract template changed; your copy is never overwritten).
5. **agent/AGENTS.md drift follow-up** (only if the warning fired): read the installed template at `node_modules/@refactco/refact-os/templates/base/agent/AGENTS.md` and the project's `agent/AGENTS.md`, diff them, and surface the meaningful additions as *suggestions*. Wait for the user's go-ahead before editing; preserve project-specific values (stack, hosting, URLs, SSH) — never replace them with template placeholders.
6. **Validate:** run `npm run refact:validate` and report the result. If it surfaces structural gaps (common when the standard adds folders/roles), suggest `/adopt` to reconcile them.
7. **Report:** source used, installed version/SHA, version transition, files changed, pruned skills, whether the AGENTS.md drift fired, and follow-up steps (review the diff, run tests, commit).

## Local checkout (opt-in only)

If the user explicitly wants to install from a local clone (developing refact-os itself), use the path they name (e.g. `npm install ../refact-os`). Don't assume that layout exists.

## Guardrails

- Prefer package-manager commands over hand-editing `package.json`.
- Prefer the published npm package (`@refactco/refact-os`); a local checkout (`../refact-os`) is opt-in for development only.
- Never run destructive git commands.
- If install fails, capture the exact error and suggest the smallest fix — don't silently retry with a different source.
- The refresh prunes only skills the package previously shipped. If the user customized a package skill in place (discouraged — fork it with a project prefix instead), warn them it will be overwritten or pruned.
