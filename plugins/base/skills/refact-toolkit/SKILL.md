---
name: refact-toolkit
description: Choose and run a Refact toolkit workflow for this project, including project config, Git, Asana, plugin installation, WordPress, Next.js, testing, client proposals, and memory. Use when the user asks for the Refact toolkit menu or a Refact action.
---

# Refact toolkit

Read [runtime instructions](../../references/plugin-runtime.md) before using this skill.

Match the requested outcome to an installed skill:

| Outcome | Skill | Pack |
|---|---|---|
| Record project structure and stack | update-project-config | base |
| Git branch, commit, or PR workflow | git-workflow | base |
| Prepare and execute an authorized live data, settings, or job change | safe-production-write | base |
| Sync or work with Asana tasks | asana | base |
| Connect Refact Control | setup-refact-control-mcp-server | base |
| Install or update toolkit packs | manage-plugins | base |
| Run a WordPress development environment | wp-env | wordpress |
| Install WordPress reference skills | install-wp-skills | wordpress |
| Update a site's WordPress plugins | plugin-update | wordpress |
| Set up Kinsta or WP Engine deployment | setup-kinsta-deploy / setup-wpengine-deploy | wordpress |
| Create or run a Next.js app | setup-nextjs-app / nextjs-dev | nextjs |
| Set up Vercel or Netlify deployment | setup-vercel-deploy / setup-netlify-deploy | nextjs |
| Test-driven development | tdd | testing |
| Draft a client proposal | draft-discovery-proposal | client |
| Render a client deliverable | render-deliverable | client |
| Review project memory/status | project-status | memory |
| Move an old scaffold to marketplace packs | migrate-to-marketplace | migrate |

Read and follow the selected skill. Its prerequisites, approval rules, and
verification steps apply. Check `.refact-os.json` when that workflow needs project
structure or stack information; ask `update-project-config` to create it if needed.

If no action was supplied, show the relevant choices from the table. If a plugin
update request is ambiguous, ask whether it means toolkit packs or the site's
WordPress plugins.

If a skill is absent from the current available-skills list, do not bypass a
disabled pack by reading its cached files. Explain which pack is needed. In
Codex, install it with `codex plugin add <pack>@refact-os`, then start a new task.
In Claude Code, use `/plugin install <pack>@refact-os` and reload plugins.
An installed pack may be disabled for the project; explain that setting before
suggesting an installation. Respect an intentional project-level disable.
