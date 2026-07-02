---
description: Refact toolkit menu — route a /refact action to the right installed skill.
argument-hint: "[action]  e.g. config | sync asana | wp-env | setup nextjs"
---

The user invoked `/refact $ARGUMENTS`.

You are the **Refact router**. Your job is to map the requested action to the one skill that
handles it and hand off to that skill. This command ships in the **base** pack; the skills it
routes to may live in other packs that the user has to install separately.

## If `$ARGUMENTS` is empty

Show this menu (and nothing else), then stop and wait for the user to pick:

| `/refact …` | Does | Pack |
|---|---|---|
| `config` | Record the project structure + tech stack in `.refact-os.json` | base (always available) |
| `sync asana` | Sync / pull / comment on Asana tasks | base (always available) |
| `setup refact-control` | Wire the Refact Control MCP server into this project | base (always available) |
| `wp-env` | Manage the local WordPress stack | wordpress |
| `install wp skills` | Vendor the WordPress/Gutenberg skills | wordpress |
| `setup kinsta` / `setup wpengine` | Create the WP auto-deploy workflows | wordpress |
| `setup nextjs` | Create or adopt a Next.js app | nextjs |
| `nextjs dev` | Run / fix an existing Next.js app | nextjs |
| `setup vercel` / `setup netlify` | Set up the Next.js deploy | nextjs |

Tell the user packs install with `/plugin install <pack>@refact-os`.

## Otherwise — route `$ARGUMENTS` to a skill

Match the action (case-insensitive, allow close paraphrases) to one row:

| Action | Skill to invoke | Pack |
|---|---|---|
| config, set config, project config | `update-project-config` | base |
| sync asana, asana, asana sync | `asana` | base |
| setup refact-control, refact-control mcp, refact control mcp, add refact context | `setup-refact-control-mcp-server` | base |
| wp-env, wp env | `wp-env` | wordpress |
| install wp skills | `install-wp-skills` | wordpress |
| setup kinsta, kinsta deploy | `setup-kinsta-deploy` | wordpress |
| setup wpengine, wpengine deploy | `setup-wpengine-deploy` | wordpress |
| setup nextjs, create nextjs, adopt nextjs | `setup-nextjs-app` | nextjs |
| nextjs dev, run nextjs | `nextjs-dev` | nextjs |
| setup vercel, vercel deploy | `setup-vercel-deploy` | nextjs |
| setup netlify, netlify deploy | `setup-netlify-deploy` | nextjs |

Then:

1. **base actions** (`config`, `sync asana`, `setup refact-control`) are always available — invoke the skill directly.
2. **pack actions**: if the matching skill is available in this session, invoke it. If it is
   **not** installed, do not improvise — tell the user exactly:
   `That action needs the <pack> pack. Install it with: /plugin install <pack>@refact-os`
   and stop.
3. If the action matches **no** row, show the menu above and ask which they meant. Do not guess.
