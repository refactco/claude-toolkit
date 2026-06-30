---
name: update-project-config
description: Write confirmed project structure and tech-stack facts into a slim .refact-os.json immediately — where code lives, languages, frameworks, hosting. Keeps the file current so it stays a reliable agent context source.
pattern: procedure
when_to_use: Any turn that confirms or changes the project's structure (where code lives, app slots in a monorepo) or its tech stack (languages, frameworks, hosting). Run this before ending the turn; never defer.
when_not_to_use: Updating the canonical prose record (blueprint/proposal/spec) — use update-canonical-record for that. Secrets or secret values — never write those here. Per-service integration details, analytics IDs, or env-var inventories — those no longer live in this file.
next_skills: []
sub_agents: []
---

# Update Project Config

## What this file is

`.refact-os.json` is a **slim** project-context file. It holds only two top-level keys:

```jsonc
{
  "structure": { /* where things live; app slots if a monorepo */ },
  "stack": { /* languages, frameworks, hosting */ }
}
```

- **`structure`** — where the code lives. Key directories, and the app slots if the repo is a monorepo (e.g. `apps/web`, `apps/<name>`).
- **`stack`** — the tech stack. Languages, frameworks, and hosting.

That is all. Do not add other top-level blocks (no `integrations`, `analytics`, `sentry`, `apps`, `operations`, `repository`, or `database` sections).

## Standing rule

Whenever a task confirms or changes the project **structure** or **tech stack**, write it to `.refact-os.json` before finishing the turn. The file is only as useful as it is current. Do not defer this to a later cleanup pass.

## Steps

1. **Verify it belongs to this project.** If the fact was mentioned in context but it's ambiguous which project it refers to, confirm before writing.
2. **Decide the target key** — `structure` (where code lives) or `stack` (languages/frameworks/hosting).
3. **Create the file if missing.** If `.refact-os.json` does not exist, create it with the slim shape above and fill in what is known.
4. **Check the current value.** Read the relevant section of `.refact-os.json` first. If it is already set to the correct value, do nothing.
5. **Write the smallest change** that captures the new fact. Surgical edits only — never rewrite whole sections or reorder keys.

## What goes where

| You just confirmed | Write under |
|---|---|
| The repo is a monorepo with app slots | `structure` (e.g. `structure.apps`) |
| Where a given app or package lives | `structure` |
| A key directory (theme dir, source root) | `structure` |
| Primary language(s) | `stack.languages` |
| Framework (Next.js, WordPress, etc.) | `stack.frameworks` |
| Hosting provider | `stack.hosting` |
| Runtime / language version | `stack` |

If a fact is not about structure or stack, it does **not** belong in this file.

## Hard rules

- **Never store secret values** — API keys, tokens, passwords, private keys. This file holds only structure and stack. If you ever need to point at a secret, store only its **name** or a pointer to where it lives (env / 1Password), never the value.
- **Slim only.** Keep just `structure` and `stack` at the top level. Don't reintroduce removed blocks.
- **Surgical edits only.** Don't reformat the file or reorder keys.
- **One write per turn** if multiple facts were confirmed. Batch them into a single `.refact-os.json` edit.
- If a value conflicts with what is already recorded, note both and flag it rather than silently overwriting.

## Example shape

```jsonc
{
  "structure": {
    "monorepo": true,
    "apps": {
      "web": "apps/web",
      "wp": "apps/<name>"
    }
  },
  "stack": {
    "languages": ["TypeScript", "PHP"],
    "frameworks": ["Next.js", "WordPress"],
    "hosting": "Vercel"
  }
}
```
