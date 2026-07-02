---
name: nextjs-dev
description: Work safely inside an existing Next.js app: locate the app, run dev/build/lint checks, and diagnose common App Router issues.
pattern: procedure
when_to_use: /refact nextjs dev | run the Next.js app | fix Next.js bug | update a Next.js route, component, server action, or API endpoint.
when_not_to_use: Creating or adopting a new app (use setup-nextjs-app), or deployment setup (use setup-vercel-deploy).
next_skills: []
sub_agents: []
---

# Next.js Development Reference

Use this reference for day-to-day development work in an existing Next.js app.

## Goal

Keep agents grounded in the target app's actual conventions: App Router versus Pages Router, package manager, component library, environment variables, and available checks.

## Preflight

1. Identify the target app:
   - If the user named a path, use it.
   - Otherwise detect the app directory from the repo: search for `next.config.*` (e.g. `next.config.js`, `next.config.mjs`, `next.config.ts`) or a `package.json` with a `next` dependency. In a monorepo this is typically `apps/<name>/`, but do not assume a fixed path.
   - You may also read the project structure / stack pointers from `.refact-os.json` if it is present.
   - If multiple apps match, ask which one to use.
2. Read the app's local `AGENTS.md` if present, then the repo root `AGENTS.md` if present.
3. Detect package manager from lockfiles, preferring the closest lockfile to the app.
4. Read `package.json` scripts before running commands. Do not assume `lint`, `typecheck`, `test`, or `build` exists.
5. Check for framework shape:
   - `app/` or `src/app/` means App Router.
   - `pages/` or `src/pages/` means Pages Router.
   - Mixed router apps require extra care; preserve the existing boundary.

## Development flow

1. Reproduce or understand the requested behavior before editing when practical.
2. Make the smallest app-local change that fits the existing structure.
3. Preserve server/client boundaries:
   - Add `"use client"` only when the component needs browser-only state, effects, event handlers, or client APIs.
   - Keep data fetching, secrets, filesystem access, and privileged SDK calls server-side.
   - Do not pass non-serializable values from Server Components into Client Components.
4. Keep route handlers and Server Actions explicit about runtime assumptions. Do not move code to Edge runtime unless the dependencies are Edge-safe.
5. Use the project's existing styling system. Do not introduce Tailwind, shadcn/ui, CSS-in-JS, or a component library unless the project already uses it or the user asks.
6. If environment variables are needed, update `.env.example` or docs with names only. Never write real secret values.

## Common checks

Run the smallest relevant checks available in `package.json`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Use the actual package manager. For narrowly scoped component edits, lint/typecheck may be enough. For routing, metadata, server actions, middleware/proxy, or config changes, prefer a production build if available.

## Local dev server

Before starting a dev server:

1. Check whether one is already running in the IDE terminals.
2. Use the app's existing dev script.
3. If the default port is occupied, surface the conflict and ask before changing ports.

Typical command:

```bash
npm run dev
```

## Debugging checklist

- Hydration mismatch: check time/random values, browser-only APIs, conditional rendering by viewport, and inconsistent server/client data.
- Server/Client Component error: remove unnecessary `"use client"` or split the interactive leaf into a client component.
- Route not found: verify segment folder names, dynamic segment syntax, route groups, parallel routes, and whether the app uses `src/`.
- Metadata issue: check `metadata`, `generateMetadata`, and whether the route is static or dynamic.
- API/route handler issue: check method exports, returned `Response`, runtime dependencies, and auth/env availability.
- Build-only failure: run the production build and fix the first real error rather than chasing dev overlay noise.

## Guardrails

- Never commit `.env*` files with real values.
- Never disable TypeScript, ESLint, auth, or validation to make a build pass.
- Never add `"use client"` at a high layout boundary without a reason; it can pull too much of the tree client-side.
- Never edit generated framework output (`.next/`, `out/`, coverage, cache folders).
- Never assume Vercel deployment unless `vercel.json`, `.vercel/`, project docs, or the user says so.

## When to stop and ask

- Multiple matching apps exist and the user did not name one.
- A fix requires changing the routing strategy, auth provider, database client, or deployment runtime.
- Existing checks are absent or failing before your change and the failure affects confidence in the work.
