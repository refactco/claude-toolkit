---
name: update-project-config
description: Update confirmed project structure and tech-stack facts in .refact-os.json while preserving settings owned by the project and other skills.
pattern: procedure
when_to_use: Any turn that confirms or changes the project's structure (where code lives, app slots in a monorepo) or its tech stack (languages, frameworks, hosting). Run this before ending the turn; never defer.
when_not_to_use: Updating prose records, storing secret values, changing another skill's integration settings, or migrating the project's configuration schema.
next_skills: []
sub_agents: []
---

# Update Project Config

Read [runtime instructions](../../references/plugin-runtime.md) before using this skill.

## What this file is

`.refact-os.json` is shared project configuration. **This skill owns the updates to
`structure` and `stack`**, not the entire file. A new file can start with:

```jsonc
{
  "structure": { /* where things live; app slots if a monorepo */ },
  "stack": { /* languages, frameworks, hosting */ }
}
```

- **`structure`** — where the code lives. Key directories, and the app slots if the repo is a monorepo (e.g. `apps/web`, `apps/<name>`).
- **`stack`** — the tech stack. Languages, frameworks, and hosting.

Other blocks can be valid. For example, Asana reads `asana.projectId`, WordPress
uses `wpEnv`, and service skills can read `sentry` or `ahrefs`. Existing projects
may also use `apps`, `operations`, or custom keys. Preserve them, including their
formatting. Do not remove or move settings to make the file match the example.

Only the skill or project workflow that owns a setting should change it. This
skill does not invent integration settings or migrate a legacy schema.

## Standing rule

Whenever a task confirms or changes the project **structure** or **tech stack**, write it to `.refact-os.json` before finishing the turn. The file is only as useful as it is current. Do not defer this to a later cleanup pass.

## Steps

1. **Verify it belongs to this project.** If the fact was mentioned in context but it's ambiguous which project it refers to, confirm before writing.
2. **Read the project's contract and actual paths.** Check `AGENTS.md` / `CLAUDE.md`,
   the existing config, and the relevant directories or manifests. Use the real app
   names and paths; the examples below are not defaults.
3. **Decide the target key** — `structure` (where code lives) or `stack` (languages/frameworks/hosting).
4. **Create the file if missing.** Start with the shape above and only confirmed facts.
5. **Check the current value and its readers.** If already correct, do nothing. If
   the project explicitly stores this same fact elsewhere, follow that contract
   rather than creating a competing copy. If two active readers require conflicting
   values, report the specific conflict and resolve it before changing that fact.
   Unrelated extra keys are not a conflict and do not require another approval.
6. **Write the smallest change.** Preserve unrelated fields, key order, and formatting,
   including fields inside `structure` and `stack` that this update does not own.
   Do not replace the file with the example or silently migrate its schema.
7. **Verify the result.** Parse the resulting JSON and inspect the diff. Confirm that
   only the intended facts changed and any existing service settings remain intact.

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

Facts outside structure and stack are outside **this skill's scope**. They may
still belong in the shared file under the owning skill's or project's contract.

## Hard rules

- **Never store secret values** — API keys, tokens, passwords, private keys. A secret
  reference may name the environment key or credential-store item, never its value.
- **Preserve other owners' settings.** Extra keys are not permission to delete,
  rename, relocate, or overwrite them. Schema cleanup requires its own scope.
- **Surgical edits only.** Don't reformat the file or reorder keys.
- **One write per turn** if multiple facts were confirmed. Batch them into a single `.refact-os.json` edit.
- A confirmed change can update a stale fact. If the correct value is still unclear,
  explain the conflicting evidence before replacing it; do not guess.

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
