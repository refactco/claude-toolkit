---
name: adopt
pattern: procedure
requires_approval: false
description: Produce a PLAN for bringing an existing, non-conformant repo up to the agent-first standard. Surveys the repo and outputs a phased transition plan as its final response — it does NOT change anything.
when_to_use: The user wants to understand what it would take to bring an existing repo to the standard — "adopt this repo", "make this repo agent-first", "what's the plan to conform this repo", "plan the migration". Run after `npx @refactco/refact-os init --no-force` has laid the mechanical seed.
when_not_to_use: For a brand-new empty project (use `npx @refactco/refact-os init`). When the user explicitly asks you to EXECUTE a plan that already exists (this skill only plans — execution is a separate, explicit step the user approves).
inputs:
  - the target repository (surveyed read-only, not fully read)
  - the standard at docs/agent-first-repo-best-practices.md (or the refact-os package copy)
  - the output of `npm run refact:validate` (read-only)
  - the skill catalog via `node agent/scripts/list-skills.mjs` (installed skills + gettable packs)
outputs:
  - a phased transition plan, presented as the final response. No files are moved, created, or deleted.
  - a "capability packs to get" list — `get-skill <pack>` recommendations matched to the repo's signals.
next_skills: []
sub_agents: []
---

# Adopt (plan only)

Produce a **plan** for bringing an existing repo to the agent-first standard. This skill is **read-only**: it surveys, reasons, and outputs a phased plan as its final response. It does **not** move, create, or delete files, create branches, or run `init`/`migrate`/`sync`. Execution is a separate step the user explicitly approves *after* reading the plan.

## Absolute rules

- **Change nothing.** No `git mv`, no writes, no deletions, no new branch, no `refact-os init|migrate|sync`. The plan is the only deliverable. If you catch yourself about to edit a file, stop — that's not this skill.
- **Survey, don't read everything.** Walk the tree; read sizes, first lines, frontmatter, headers; deep-read only what a recommendation needs. For a large repo, fan out one read-only survey sub-agent per top-level area, each returning a short summary. Never try to hold the whole repo at once.
- **This is the target repo, not refact-os.** You are planning *this* repo's conformance. `refact-os` is the scaffolding tool, not this repo — don't adopt its identity or branding, and don't assume this repo is a refact-os clone. Describe everything in terms of what *this* repo actually is.
- **Ask only what you must to plan.** If a canonical-vs-duplicate choice blocks the plan, list it as an open question in the plan rather than guessing or acting.

## Steps

1. **Survey** the repo breadth-first (sub-agents per area). For each area note: what's there, which of the six roles it maps to (Evidence/Knowledge/Task/Output/Software/Agent), and anything load-bearing (scripts, automation, hardcoded paths).
2. **Read the gaps:** run `npm run refact:validate` (read-only) and fold its findings in. If the script/binary isn't wired up yet, fall back to `npx @refactco/refact-os validate` (read-only, touches nothing in the repo) — don't run `npm install` here, since this skill changes nothing.
3. **Write the plan** and present it as your final response. Structure it as ordered **phases**, each a small reviewable unit, with: the proposed moves/renames/**deletions**, the references that would need updating, and any open questions. Typical items:
   - Missing seed → `npx @refactco/refact-os init --no-force` (additive).
   - Duplicate canonical map (`INDEX.md` vs `docs/index.md`) → which is canonical; merge the other.
   - Duplicate contract (root `AGENTS.md` vs `agent/AGENTS.md`) → consolidate into `agent/AGENTS.md`, leave a thin root pointer.
   - Variant dirs (`docs/tasks` vs `docs/task`) → consolidate onto the standard name.
   - **Codebase at the repo root that the standard puts under `apps/<slot>/`** → propose moving the existing tree into the standard slot. Do **not** recommend keeping the legacy root layout just to avoid touching existing CI; adjust CI to match the standard, not the other way around. The `wp-env`, `setup-wpengine-deploy`, `setup-kinsta-deploy`, `setup-vercel-deploy`, and `setup-netlify-deploy` skills all assume `apps/<slot>/`. Specifically:
     - **WordPress** (root `wp-content/`, often with WP-core file ignores in the root `.gitignore` and reusable deploy workflows reading from root `wp-content/`) → propose `git mv wp-content apps/wordpress/wp-content`, paired with the `.gitignore` move below and a CI update (replace existing deploy workflows with the ones `setup-wpengine-deploy` / `setup-kinsta-deploy` generate, or update inputs to any reusable workflow so its source path is `apps/wordpress/wp-content/`).
     - **Next.js** (root `next.config.*` or `package.json` with `next`) → propose moving the app into `apps/web/` (or the slot the user prefers) with the same paired CI update.
     - **Generic single-app at the root** → propose `apps/<slot>/`; slot name is the user's call (suggest based on detection).
     Surface as a single phase that bundles the codebase move, the `.gitignore` move below, and the CI/workflow update — the three are one paired operation, not three. Open questions to list: which CI workflows need rewiring, whether any host-side absolute paths (deploy script `cd`s, host doc-root expectations, SSH paths in `.refact-os.json`) need adjusting, and whether the move lands in one PR or a phased branch.
   - **Existing root `.gitignore` (paired with the codebase move above)** → propose moving the existing file wholesale to `apps/<slot>/.gitignore` (merge if one already exists there), and refresh the root `.gitignore` from the refact-os shipped template. The existing rules were written for code at the repo root; once the code lives at `apps/<slot>/`, the rules belong with the code. The refreshed root `.gitignore` is project-level only (refact-os hygiene: `.env`, OS junk, the generated `.claude/settings.local.json`, etc.). The user can pluck specific rules back to root afterward if they realize one is project-scoped (e.g. an org-wide editor pattern). Surface this as part of the parent codebase-move phase, not a separate one.
   - Forbidden `agent/workflows/` / `agent/evals/` → fold each into `agent/skills/<verb-object>/SKILL.md` (orchestrator/review pattern); propose names.
   - **Folders to delete** where a folder is genuinely unneeded (e.g. an empty `docs/deliverables/` on a repo that ships nothing) — list them explicitly so the user can approve.
   - Content not in a clear role → propose a role + destination.
   - **Preserve** `docs/company/` (upstream for `npx refact-os sync company`) and raw evidence — call these out as intentionally unchanged.
4. **Recommend capability packs.** Run `node agent/scripts/list-skills.mjs` to see what's installed and the gettable catalog, then match the repo's signals to packs and recommend `get-skill <pack>` for the gaps (additive — the user runs them after approving):
   - `apps/wordpress/`, `wp-content/`, `.wp-env.json`, or a WordPress codebase → `get-skill wordpress`.
   - `next.config.*`, or `next` in `package.json` deps → `get-skill nextjs`.
   - sustained product code that isn't a one-off file → `get-skill code`.
   - the repo ships reviewed artifacts to a client → `get-skill client`.
   Recommend only what the repo's evidence supports — don't get a pack speculatively. Getting a pack also records it in `.refact-os.json` and, for `wordpress`/`nextjs`, sets the stack entry.
5. **Stop.** End with: "This is a plan only — nothing was changed. Review it; when you're ready, approve the phases you want and I'll execute them one at a time." Do not proceed to execute.

## Output shape

A short summary, then the phased plan (Phase 1, Phase 2, …) with checkboxes, a **"capability packs to get"** list (`get-skill <pack>` matched to the repo's signals), an "intentionally left unchanged" list, and an "open questions" list. Offer to write the plan to `docs/task/open/<yyyy-mm-dd>-adopt.md` **only if the user asks** — by default, leave the repo untouched.
