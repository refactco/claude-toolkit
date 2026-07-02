---
name: setup-vercel-deploy
description: Link a Next.js app to Vercel and document deployment settings without assuming every Next.js project deploys to Vercel.
pattern: procedure
requires_approval: true
when_to_use: /refact setup vercel deploy | deploy Next.js to Vercel | link this Next.js app to Vercel | configure Vercel for this app.
when_not_to_use: Non-Vercel hosting, local-only development, or generic Next.js code changes.
next_skills:
  - nextjs-dev
sub_agents: []
---

# Vercel Deploy Setup Reference

Use this reference when the user explicitly wants a Next.js app linked or configured for Vercel. Do not run this automatically for every Next.js project.

## Goal

Set up deployment metadata and local verification while keeping project-specific hosting choices explicit. This skill may call external services, create project links, and change deployment settings, so it requires user approval before writes.

## Preflight

1. Confirm the target app path. If multiple Next.js apps exist, ask which app to deploy.
2. Confirm Vercel is the intended hosting provider.
3. Check whether the Vercel CLI exists:

   ```bash
   vercel --version
   ```

   If missing, ask before installing it. Prefer a project-local or `npx vercel` flow over global installation unless the user wants a global CLI.

4. Check authentication:

   ```bash
   vercel whoami
   ```

   If unauthenticated, stop and ask the user to log in. Do not attempt to handle credentials in chat.

5. Inspect existing Vercel state:
   - `.vercel/project.json` means the app or repo is already linked.
   - `vercel.json` may define framework/build/output settings.
   - Existing GitHub workflows may already deploy the app.

## Link flow

1. From the target app directory, run:

   ```bash
   vercel link
   ```

2. If the repo is a monorepo, make sure the Vercel project root points at the app directory (detect it from the repo, or ask the user — e.g. `apps/<name>` in a monorepo), not the repo root, unless the repo intentionally builds from root.
3. Do not commit `.vercel/` unless the team intentionally tracks Vercel project metadata. If unsure, ask. Many teams keep `.vercel/` local and document the project name instead.
4. Record hosting (`vercel`) and each environment's `branch` + `url` (production and preview/staging) in `.refact-os.json` › `stack.nextjs` when stable. Keep app-specific build details (deployment owner, project name, app root, build command) in a deploy doc inside the app directory (e.g. `docs/deploy.md` under the app directory; create it on demand if missing).

## Environment variables

1. List required variable names from docs, `.env.example`, and code references.
2. Add or pull variables through Vercel CLI only with explicit user approval:

   ```bash
   vercel env ls
   vercel env pull
   ```

3. Never paste secret values into files, chat, logs, or docs. Document names and purpose only.
4. Keep local `.env.local` uncommitted.

## Verification

Prefer local production checks before deploying:

```bash
npm run build
vercel build
```

Use the app's actual package manager. If `vercel build` fails because the project is not linked or env vars are missing, surface the missing piece rather than guessing.

For a preview deploy, confirm with the user, then run:

```bash
vercel deploy
```

For production promotion, require explicit approval:

```bash
vercel deploy --prod
```

## Git integration

If Vercel Git integration is enabled, prefer PR preview deployments over ad-hoc CLI deploys. Document:

- Production branch.
- Preview branch behavior.
- Monorepo root directory.
- Required Vercel project environment variables.

## Guardrails

- Never assume Vercel just because the app is Next.js.
- Never deploy to production without explicit user approval.
- Never print, commit, or store secret values.
- Never change DNS, domains, production branch, or project ownership without confirmation.
- Never overwrite existing `vercel.json` or CI workflows without reading them and explaining the change.

## When to stop and ask

- The app is already linked to a different Vercel project than the user named.
- The repo root and Vercel root directory disagree.
- Required environment variables are unknown or missing.
- The user asks to promote a preview to production or change domain settings.
