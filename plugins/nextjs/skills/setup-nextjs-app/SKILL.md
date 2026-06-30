---
name: setup-nextjs-app
description: Create or adopt a Next.js app in the project's app directory, preserving existing project choices and documenting local runtime details.
pattern: procedure
when_to_use: /refact setup nextjs app | add Next.js app | create a Next.js app | adopt existing Next.js codebase.
when_not_to_use: Non-Next.js projects, or tasks that only modify an already configured app.
next_skills:
  - nextjs-dev
  - setup-vercel-deploy
  - setup-netlify-deploy
sub_agents: []
---

# Setup Next.js App Reference

Use this reference when the user asks to create a new Next.js application or bring an existing Next.js app into the project.

## Goal

Create a predictable home for runnable Next.js code without turning the project into a framework starter. The project owns its overall structure; `create-next-app` or the existing application owns framework code.

## Resolve the app directory

Decide where the Next.js app lives before doing anything else:

- Detect it from the repo. Look for an existing `next.config.*` or `next` dependency at the repo root, or an existing app folder.
- If it is a monorepo (workspaces present), prefer `apps/<name>` and ask for `<name>` if the user did not supply one.
- If it is a single-app repo, the repo root is a valid home.
- If the layout is ambiguous, ask the user where the app should live.

In the layout and commands below, `<app-dir>` means the directory you resolved here.

## Canonical layout

```txt
<project-root>/
├── <app-dir>/
│   ├── AGENTS.md
│   ├── docs/              # earned once technical docs exist
│   ├── package.json
│   └── ... Next.js code
└── docs/
```

## Preflight

1. Confirm `.refact-os.json` has a `stack.nextjs` entry, or that the target codebase has `next.config.*` / a `next` dependency. If it is missing in `.refact-os.json` and the repo gives no signal, ask whether to continue as a Next.js project.
2. Inspect the existing repo shape:
   - Is there already a Next.js app at the root?
   - Is there already an app under a per-app directory (e.g. `apps/<name>/` in a monorepo)?
   - Which package manager is present: `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, or `bun.lockb`?
3. If moving an existing root app into a per-app directory would touch many files, stop and propose the migration before editing. Do not silently restructure a working app.
4. Do not overwrite an existing app directory.

## Flow A — Create a new app

1. Resolve:
   - `APP_DIR` from the rules in "Resolve the app directory".
   - `PACKAGE_MANAGER` from existing lockfiles; if none exist, use `npm`.
2. Create the app with the official generator, using conservative defaults:

   ```bash
   npx create-next-app@latest <app-dir> --ts --eslint --app --src-dir --import-alias "@/*"
   ```

   If the repo already uses `pnpm`, `yarn`, or `bun`, use that package manager's equivalent runner. Do not force Tailwind, a package manager, or an experimental option unless the user asks.

3. Add `<app-dir>/AGENTS.md`:

   ```md
   # AGENTS.md

   This is the Next.js app for this project. Root project context lives in the repo-root docs/.

   - Prefer existing components, route structure, package manager, and lint/build scripts.
   - App technical docs belong in ./docs/ when they are specific to this app.
   - Run the smallest relevant check after edits: lint, typecheck, tests, or build.
   - Never commit .env* files with real secrets.
   ```

4. Add an `<app-dir>/docs/README.md` only if there is a concrete technical note to capture now (create the `docs/` directory on demand if it does not exist). Otherwise let `docs/` be earned later.
5. Report the app path, install command used, and available scripts from `<app-dir>/package.json`.
6. Optionally record the resolved app directory and package manager in `.refact-os.json` under `stack.nextjs` so later skills can read it. Keep it slim — non-secret structure/config only, never secrets.

## Flow B — Adopt an existing app

1. If the app already lives in a per-app directory, leave it there.
2. If the app lives at the repo root, ask before moving it. A root-to-per-app migration may require updating:
   - CI workflow paths.
   - Vercel project root.
   - Docker files.
   - TypeScript path aliases.
   - Import aliases and workspace package references.
3. Add `AGENTS.md` inside the app if missing, using the template from Flow A.
4. Record any unresolved migration decision in `docs/decisions.md` or `docs/task/open/` if the user wants to defer it (create the directory on demand if it is missing).

## Package manager rules

- Existing lockfile wins. Do not introduce a second package manager.
- In monorepos, prefer the root workspace manager and add the app to the workspace only if the repo already uses workspaces.
- If package-manager intent is unclear, ask once before generating.

## Verification

From the app directory, run the smallest useful checks that exist:

```bash
npm run lint
npm run build
```

Use the actual package manager. If a script is missing, report that rather than inventing one.

## Guardrails

- Do not scaffold framework code into the project root by default unless the root is the resolved app directory; otherwise use the resolved app directory.
- Do not move a root app into a per-app directory without user confirmation.
- Do not add hosting, auth, database, analytics, or UI libraries as part of app setup unless requested.
- Do not commit secrets from `.env`, `.env.local`, or provider dashboards.

## When to stop and ask

- Multiple Next.js apps are present and the user did not name a target.
- The repo already has a root Next.js app and moving it would affect CI/deploy paths.
- The user asks for a starter choice with lasting consequences: Tailwind, shadcn/ui, database, auth provider, deployment target, or package manager.
