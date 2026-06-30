---
name: install-wp-skills
description: Vendor the WordPress/Gutenberg agent skills into this project. WordPress projects only.
pattern: procedure
when_to_use: /refact install wp skills | add WordPress agent skills | pull Gutenberg/block skills.
when_not_to_use: Non-WordPress projects.
next_skills: []
sub_agents: []
---

# Install WordPress Agent Skills Reference

Use this reference when the user invokes `/refact install wp skills` (or asks to "add WordPress skills", "pull the WP agent skills", "install Gutenberg/block skills", etc.).

## Goal

Vendor in a curated set of WordPress-specific skills from the upstream [`WordPress/agent-skills`](https://github.com/WordPress/agent-skills) repository into this project's local skills directory (`.claude/skills/` — create it if it does not exist yet).

These skills give the agent expert WordPress knowledge (blocks, block themes, plugin dev, REST API, performance, etc.) without bloating the refact-os scaffolder itself.

## Curated skill list (default)

| Skill | Teaches |
|---|---|
| `wp-block-development` | Gutenberg blocks: `block.json`, attributes, rendering, deprecations |
| `wp-block-themes` | Block themes: `theme.json`, templates, patterns, style variations |
| `wp-plugin-development` | Plugin architecture, hooks, settings API, security |
| `wp-rest-api` | REST routes/endpoints, schema, auth, response shaping |
| `wp-interactivity-api` | Frontend interactivity with `data-wp-*` directives and stores |
| `wp-abilities-api` | Capability-based permissions and REST API authentication |
| `wp-wpcli-and-ops` | WP-CLI automation, multisite, search-replace |
| `wp-performance` | Profiling, caching, DB optimization, Server-Timing |
| `wp-phpstan` | PHPStan static analysis tuned for WordPress |
| `wp-playground` | WordPress Playground for instant local environments |

The upstream repo also ships `wordpress-router`, `wp-project-triage`, `wpds`, `wp-plugin-directory-guidelines`, and `blueprint`. They are **not** in the default set — `wordpress-router` and `wp-project-triage` overlap with the `refact` and `code-development` skills; the others are situational. Install them explicitly only if the user asks.

## Step 1 — Preflight

### 1a. Confirm this is a WordPress project

Check `.refact-os.json` for a `stack.wordpress` entry, or look for `wp-content/` / `.wp-env.json`. If the project is **not** WordPress, stop and ask the user to confirm — these skills are WP-specific and have no value in a non-WordPress project.

### 1b. Check prerequisites

```bash
command -v git
command -v node
node --version
```

`node` must be **18 or newer** (the upstream `skillpack-build.mjs` script uses modern ESM + node:fs features). If it's older, surface the version and stop.

### 1c. Confirm with the user

Print the curated list above and ask the user to confirm before proceeding. Offer them the chance to:

- Accept the default subset.
- Add to it (e.g. include `wpds` for design system work).
- Subtract from it (e.g. skip `wp-playground` if they already use Local).

Record the final skill list as `<skills>` for Step 3.

## Step 2 — Clone upstream to a temp dir

Do **not** clone the upstream repo into the project tree — it would pollute git status. Use a temp directory:

```bash
WP_SKILLS_TMP="$(mktemp -d -t wp-agent-skills.XXXXXX)"
git clone --depth=1 https://github.com/WordPress/agent-skills.git "$WP_SKILLS_TMP"
```

If the clone fails (network, rate limit, repo moved), surface the exact error and stop. Do **not** retry by switching protocols or guessing alternate URLs.

## Step 3 — Build and install

From inside the temp clone, build the distribution and install only the chosen skills with `--targets=claude`:

```bash
cd "$WP_SKILLS_TMP"
node shared/scripts/skillpack-build.mjs --clean
node shared/scripts/skillpack-install.mjs \
  --dest="<absolute-path-to-this-project>" \
  --targets=claude \
  --skills=<skills>
```

Notes:

- `<absolute-path-to-this-project>` is the directory where the user invoked `/refact`. Capture it before `cd`-ing into the temp dir (`PROJECT_ROOT="$(pwd)"` before the `cd`).
- `<skills>` is the comma-separated final list from Step 1c (e.g. `wp-block-development,wp-plugin-development,wp-rest-api,...`).
- The installer uses `--mode=replace` by default, which only overwrites the specific skill subfolders being installed. Any other skills already in the local skills directory are untouched.
- Do **not** pass `--global` here — these skills should live in the project, not the user's home, so each engagement controls its own set.

If the install script errors with "Unknown skill: …", correct the name (skills are case-sensitive, kebab-case) and re-run. Don't silently drop the unknown name from the list.

## Step 4 — Clean up

```bash
rm -rf "$WP_SKILLS_TMP"
```

If `rm` fails (permissions, the user `cd`-ed into the tmp dir, etc.), surface it but do **not** retry with `sudo` or `-f` flags beyond what's shown.

## Step 5 — Verify and report

```bash
ls .claude/skills/
```

Confirm each requested skill landed as `.claude/skills/wp-<name>/SKILL.md`. Then report to the user:

- The list of installed skills with one-line descriptions (from the table above).
- A reminder that these skills are now available and will be auto-invoked by the agent when relevant tasks come up (e.g. asking to build a block triggers `wp-block-development`).
- A note that the skills are vendored copies — to update them later, the user can re-run `/refact install wp skills` and the installer will replace the existing folders.

## Updating later

To pull newer versions of the upstream skills, just re-run this flow. The `--mode=replace` default means each skill folder is rebuilt from the latest upstream contents — local edits to the vendored copies will be lost, so:

- If the user has modified a vendored skill, ask before overwriting.
- Encourage them to upstream the change to `WordPress/agent-skills` rather than fork locally.

## Guardrails

- **Never** clone the upstream repo into the project tree.
- **Never** install with `--global` from this flow — global installs belong to the user's home, not a per-project scaffolder.
- **Never** add `wordpress-router` or `wp-project-triage` to the default set — they overlap with `refact` routing.
- **Never** silently overwrite a user-modified vendored skill. Ask first.
- **Never** retry a failed clone or install with elevated permissions or alternative flags without user approval.
