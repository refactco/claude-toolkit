---
name: refact
description: Single entrypoint skill for refact-os project operations. Use when the user invokes /refact with an action like updating the package, importing chat history, or running project-type setup flows.
pattern: orchestrator
when_to_use: The user types /refact <action> — init, update the package, get chat history, process docs, status, list skills, get a skill pack, create a skill, git it, install wp skills, add codebase, sync asana, setup kinsta, wp-env operations, setup nextjs app, setup vercel deploy, or setup netlify deploy.
when_not_to_use: For saving/committing a change (use git-workflow; product code adds code-development) or for capturing a learning (use extract-learnings).
disable-model-invocation: true
next_skills:
  - setup-project
  - update-package
  - import-chat-history
  - process-docs
  - project-status
  - git-it
  - git-workflow
  - asana
  - list-skills
  - get-skill
  - create-skill
  - contribute-skill
sub_agents: []
---

# Refact Skill

Use this skill as a command router for `/refact ...` requests.

## Preflight: required scaffold metadata

Every `/refact ...` invocation passes through the `preflight-metadata` Cursor hook (registered on `beforeSubmitPrompt` in `.cursor/hooks.json`). The hook reads `.refact-os.json` at the project root and checks that every **required** field is present. Optional fields never block — the hook ignores them whether they are set, `null`, or absent.

Fields (kept in sync between `lib/refact-config.js` in the package and `.cursor/hooks/preflight-metadata.mjs` in the project):

| Path | Required | Notes |
|---|---|---|
| `stack` | yes | Object keyed by project type — **its keys are the type list** (`wordpress`, `nextjs`, `blank`); at least one. Each entry holds `hosting`, `runtime`, and `environments` (per-env `url` / `branch` / optional `ssh`). There is no separate `projectType`/`projectTypes`. |
| `asana.projectId` | no (optional) | Numeric ID from `https://app.asana.com/0/<id>/...`. The gate never blocks on it — set it (or run `/refact sync asana`) when you start using Asana; otherwise leave it unset or `null`. |

If the hook detects a missing **required** field it blocks the prompt and returns a message listing them. When that happens:

1. Ask the user for each missing value, one focused question at a time.
2. Write the answers into `.refact-os.json` (create the file if it doesn't exist).
3. Tell the user to re-run their original `/refact` command.

`.refact-os.json` shape (`stack` is keyed by type; `ssh` is present only for SSH-push hosts like Kinsta/WP Engine and omitted for git-integration hosts like Vercel/Netlify):

```json
{
  "stack": {
    "wordpress": {
      "hosting": "kinsta",
      "runtime": "wp-env (PHP 8.2, MySQL 8)",
      "environments": {
        "production": { "url": "https://www.example.com/", "branch": "main", "ssh": { "user": "example", "host": "1.2.3.4", "port": 12345, "path": "/www/example_123/public" } },
        "staging": { "url": "https://stg-example.kinsta.cloud/", "branch": "stage", "ssh": { "user": "example", "host": "1.2.3.4", "port": 54321, "path": "/www/example_123/public" } }
      }
    },
    "nextjs": {
      "hosting": "vercel",
      "runtime": "Node 20 + pnpm",
      "environments": {
        "production": { "url": "https://app.example.com/", "branch": "main" },
        "staging": { "url": "https://staging.example.com/", "branch": "develop" }
      }
    }
  },
  "asana": {
    "projectId": "1209712345678901",
    "projectUrl": "https://app.asana.com/0/1209712345678901"
  }
}
```

Secret credentials — `ASANA_TOKEN`, SSH **private keys**, deploy tokens — belong in `.env` or the CI secret store, never in `.refact-os.json`. The config holds only non-secret routing (hosts, ports, paths, branches, URLs).

## Intent Routing

This is an explicit command router: it maps a typed `/refact <action>` to the skill that does the work and **delegates** to it — it does not reimplement that skill's steps. Every target below carries its own `when_to_use`, so the agent can also select it directly without `/refact`; this table just makes the operations discoverable as typed commands.

1. Parse the requested action from the user message.
2. Route to the matching skill (load its `SKILL.md`):
   - init / initialize / setup / bootstrap / "check what's left to configure" -> `agent/skills/setup-project/SKILL.md`
   - package update / bump / reinstall requests -> `agent/skills/update-package/SKILL.md`
   - chat history import requests -> `agent/skills/import-chat-history/SKILL.md`
   - process docs / ingest docs / digest new inputs -> `agent/skills/process-docs/SKILL.md`
   - status / what's pending / what's unprocessed -> `agent/skills/project-status/SKILL.md`
   - list skills / what skills exist / what can you do here / available capabilities -> `agent/skills/list-skills/SKILL.md`
   - get skill / get a pack / add WordPress|Next.js|client|code capability / pull a skill pack -> `agent/skills/get-skill/SKILL.md`
   - create skill / add a skill / author a skill / turn this into a skill -> `agent/skills/create-skill/SKILL.md`
   - contribute skill / promote skill / upstream this skill / share this skill with refact-os -> `agent/skills/contribute-skill/SKILL.md`
   - git it / set up the repo / create the remote / first commit / publish to GitHub -> `agent/skills/git-it/SKILL.md`
   - save my changes / commit this / push it up / open a PR / publish this change / share for review -> `agent/skills/git-workflow/SKILL.md`
   - install wp skills / add WordPress skills / pull Gutenberg skills / vendor WP agent skills -> `agent/skills/install-wp-skills/SKILL.md` *(WordPress engagements only)*
   - add codebase / clone repo into apps / scaffold app -> `agent/skills/add-codebase/SKILL.md` *(code pack only)*
   - asana / sync asana / get asana tickets / pull asana / post asana comment / add update to asana task -> `agent/skills/asana/SKILL.md`
   - setup kinsta auto-deploy / add kinsta deploy / enable kinsta auto-deploy / create kinsta workflows -> `agent/skills/setup-kinsta-deploy/SKILL.md` *(WordPress engagements only)*
   - wp-env setup / start the local wp env / spin up wordpress locally / wp-env pull [plugins|mu-plugins|db] / mirror staging locally / wp-env reset / wp-env domain set <host> / wp-env domain clear / custom local domain / website.local instead of localhost -> `agent/skills/wp-env/SKILL.md` *(WordPress engagements only)*
   - setup nextjs app / add Next.js app / create a Next.js app / adopt existing Next.js codebase -> `agent/skills/setup-nextjs-app/SKILL.md` *(Next.js engagements only)*
   - nextjs dev / run the Next.js app / fix Next.js bug / update a Next.js route, component, server action, or API endpoint -> `agent/skills/nextjs-dev/SKILL.md` *(Next.js engagements only)*
   - setup vercel deploy / deploy Next.js to Vercel / link this Next.js app to Vercel -> `agent/skills/setup-vercel-deploy/SKILL.md` *(Next.js + Vercel only)*
   - setup netlify deploy / deploy Next.js to Netlify / link this Next.js app to Netlify -> `agent/skills/setup-netlify-deploy/SKILL.md` *(Next.js + Netlify only)*

> The project-type skills come from catalog **packs** gotten on demand, not from `init`. If a referenced skill's folder is absent, its pack isn't installed yet — get it with `npx refact-os get-skill <pack>` (or `/refact get-skill <pack>`). Packs: `wordpress` (`wp-env`, `install-wp-skills`, `setup-kinsta-deploy`, `setup-wpengine-deploy`), `nextjs` (`setup-nextjs-app`, `nextjs-dev`, `setup-vercel-deploy`, `setup-netlify-deploy`), `code` (`add-codebase`, `code-development`), `client` (`create-deliverable`).

3. Load and follow the matched skill exactly, execute the needed commands, and report results. Each target is a standalone skill — the agent may also select it directly from its own `when_to_use` without going through `/refact`.

## Examples

- `/refact init`
- `/refact initialize`
- `/refact setup`
- `/refact bootstrap`
- `/refact update the package`
- `/refact bump refact-os`
- `/refact get chat history`
- `/refact import chats`
- `/refact process docs`
- `/refact ingest new emails`
- `/refact status`
- `/refact what's unprocessed`
- `/refact list skills`
- `/refact what skills exist`
- `/refact get skill wordpress`
- `/refact get the nextjs pack`
- `/refact create skill`
- `/refact add a skill`
- `/refact contribute skill`
- `/refact promote this skill to refact-os`
- `/refact git it`
- `/refact set up the repo`
- `/refact create the remote`
- `/refact publish to GitHub`
- `/refact save my changes`
- `/refact open a PR`
- `/refact install wp skills`
- `/refact add WordPress agent skills`
- `/refact pull Gutenberg/block skills`
- `/refact add codebase https://github.com/foo/bar`
- `/refact add codebase wordpress`
- `/refact add codebase seo`
- `/refact sync asana`
- `/refact get asana tickets`
- `/refact sync asana ticket 1209712345678901`
- `/refact setup kinsta auto-deploy`
- `/refact add kinsta deploy`
- `/refact create kinsta workflows`
- `/refact wp-env setup`
- `/refact wp-env pull`
- `/refact wp-env pull plugins`
- `/refact wp-env pull mu-plugins`
- `/refact wp-env pull db`
- `/refact wp-env reset`
- `/refact wp-env domain set website.local`
- `/refact wp-env domain clear`

## If Unclear

- Ask one focused clarifying question only when action cannot be inferred.
- Otherwise proceed directly using the best matching reference.
