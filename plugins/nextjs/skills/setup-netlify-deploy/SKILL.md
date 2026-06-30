---
name: setup-netlify-deploy
description: Link a Next.js app to Netlify and document deployment settings without assuming every Next.js project deploys to Netlify.
pattern: procedure
requires_approval: true
when_to_use: /refact setup netlify deploy | deploy Next.js to Netlify | link this Next.js app to Netlify | configure Netlify for this app.
when_not_to_use: Non-Netlify hosting, local-only development, or generic Next.js code changes.
next_skills:
  - nextjs-dev
sub_agents: []
---

# Netlify Deploy Setup Reference

Use this reference when the user explicitly wants a Next.js app linked or configured for Netlify. Do not run this automatically for every Next.js project.

## Goal

Set up Netlify deployment metadata and verification while keeping hosting choices explicit. This skill may call external services, create project links, and change deploy settings, so it requires user approval before writes.

## Preflight

1. Confirm the target app path. If multiple Next.js apps exist, ask which app to deploy.
2. Confirm Netlify is the intended hosting provider.
3. Check whether the Netlify CLI exists:

   ```bash
   netlify --version
   ```

   If missing, ask before installing it. Prefer `npx netlify-cli` for one-off setup unless the user wants a global CLI.

4. Check authentication:

   ```bash
   netlify status
   ```

   If unauthenticated, stop and ask the user to run `netlify login`. Do not handle credentials or tokens in chat.

5. Inspect existing Netlify state:
   - `.netlify/state.json` means the app or repo may already be linked.
   - `netlify.toml` may define build base, command, publish directory, redirects, headers, functions, or plugins.
   - Existing GitHub workflows may already deploy the app.

## Link flow

1. From the target app directory, run one of:

   ```bash
   netlify init
   netlify link
   ```

   Use `init` for a new Netlify site and `link` for an existing Netlify site.

2. If the repo is a monorepo, make sure Netlify's base directory points at the app directory (detect it from the repo, or ask the user — e.g. `apps/<name>` in a monorepo) unless the repo intentionally builds from root.
3. Do not commit `.netlify/` unless the team intentionally tracks Netlify project metadata. If unsure, ask. Many teams keep it local and document the site name/id instead.
4. Record hosting (`netlify`) and each environment's `branch` + `url` (production and staging) in `.refact-os.json` › `stack.nextjs` when stable. Keep app-specific build details (team, site name, app root, build command, publish directory) in a `docs/deploy.md` inside the app directory (detect it from the repo, or ask the user — e.g. `apps/<name>` in a monorepo); create the file on demand if it does not exist.

## Build settings

Prefer Netlify's Next.js detection when it works. Only add or edit `netlify.toml` when the repo needs explicit settings, such as a monorepo app root or custom redirects.

Typical app-local settings when `netlify.toml` lives inside the app directory (detect it from the repo, or ask the user — e.g. `apps/<name>` in a monorepo):

```toml
[build]
  command = "npm run build"
  publish = ".next"
```

Typical root-level monorepo settings (replace `apps/<name>` with the actual app directory):

```toml
[build]
  base = "apps/<name>"
  command = "npm run build"
  publish = "apps/<name>/.next"
```

Use the actual package manager command. If the project already has a `netlify.toml`, read it first and preserve unrelated settings.

## Environment variables

1. List required variable names from docs, `.env.example`, and code references.
2. Inspect Netlify env var names only with explicit user approval:

   ```bash
   netlify env:list
   ```

3. Never paste secret values into files, chat, logs, or docs. Document names and purpose only.
4. Keep local `.env.local` uncommitted.

## Verification

Prefer local production checks before deploying:

```bash
npm run build
netlify build
```

Use the app's actual package manager. If `netlify build` fails because the project is not linked or env vars are missing, surface the missing piece rather than guessing.

For a draft deploy, confirm with the user, then run:

```bash
netlify deploy
```

For production promotion, require explicit approval:

```bash
netlify deploy --prod
```

## Git integration

If Netlify Git integration is enabled, prefer PR/branch deploys over ad-hoc CLI production deploys. Document:

- Production branch.
- Branch deploy behavior.
- Deploy previews.
- Monorepo base directory.
- Required Netlify environment variables.

## Guardrails

- Never assume Netlify just because the app is Next.js.
- Never deploy to production without explicit user approval.
- Never print, commit, or store secret values.
- Never change DNS, domains, production branch, build image, or team ownership without confirmation.
- Never overwrite existing `netlify.toml` or CI workflows without reading them and explaining the change.
- Never add Next.js runtime/plugin config blindly; use the current project settings and Netlify detection unless a build error proves explicit config is needed.

## When to stop and ask

- The app is already linked to a different Netlify site than the user named.
- The repo root and Netlify base directory disagree.
- Required environment variables are unknown or missing.
- The user asks to promote a deploy to production or change domain settings.
