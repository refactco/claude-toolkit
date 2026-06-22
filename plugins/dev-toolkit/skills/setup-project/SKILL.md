---
name: setup-project
description: Post-scaffold setup checklist — complete .refact-os.json (stack types, hosting, runtime, environments) and Asana, create .env, set up git/GitHub, and scaffold project-type slots.
pattern: procedure
when_to_use: /refact init | initialize | setup | bootstrap, or "check what's left to configure" after scaffolding.
when_not_to_use: Saving/committing a change (use git-workflow; product code adds code-development) or regenerating adapters (use refact-os sync).
next_skills:
  - sync-env-vars
  - git-it
  - update-project-config
sub_agents: []
---

# Init Reference

Use this reference when the user invokes any of:

- `/refact init`
- `/refact initialize`
- `/refact setup`
- `/refact bootstrap`

## What this does

Walks an **idempotent checklist** that brings a freshly-scaffolded project to a fully-configured state. Each checkbox is verified independently. If a checkbox is already met, skip it silently. If it isn't, handle that one item — by asking the user, editing files, or delegating to another reference — then re-verify and move on.

The checklist is safe to re-run any time. Running `/refact init` on a fully-configured project should report "all checks pass" and do nothing.

## Checklist

Run each check in order. After handling any unmet item, re-check it before moving on.

### 0. Project identity (`.refact-os.json` › `project` + `repository`)

**Check:** `.refact-os.json` exists and `project.name`, `project.slug`, `project.description`, `project.kind` are filled (not `null`). Also `repository.productionBranch` and `repository.integrationBranch`.

Many of these are auto-detected by `init` (name/slug from `package.json`, url/owner/name from the git remote). Only ask for what is still `null`.

| Field | Values |
|---|---|
| `project.kind` | `client-site`, `internal-tooling`, `product`, `campaign` |
| `project.tech` | Free-form for non-web stacks: `"python-fastapi"`, `"react-native"`, `"data-pipeline"` — leave `null` for web projects |
| `repository.productionBranch` | Usually `main` (auto-filled from current branch) |
| `repository.integrationBranch` | `stage`, `develop`, or `null` if the project has no staging branch |

**Handle (if unmet):** Ask one question per missing field. Write directly into `.refact-os.json` via the `update-project-config` skill.

### 1. Project stack (`.refact-os.json` › `stack`)

**Check:** `.refact-os.json` exists at the project root and `stack` names at least one project type. `stack` is an object **keyed by project type** — its keys *are* the type list. There is no separate `projectType`/`projectTypes`.

| Field | Required | Value |
|---|---|---|
| `stack.<type>` | yes (≥1) | One key per type the repo is: `wordpress`, `nextjs`, and/or `blank` |
| `asana.projectId` | optional | Numeric Asana project ID, or `null` to mark as not used |

**Handle (if unmet):** Ask which project type(s) this engagement is (`wordpress`, `nextjs`, `blank`, or a hybrid like `wordpress,nextjs`). For each, ensure a `stack.<type>` entry exists with the shape `{ "hosting": null, "runtime": null, "environments": {} }` (detail is filled in step 2). For a type that has a capability pack (`wordpress`, `nextjs`), run `npx refact-os get-skill <type>` — it adds the pack's skills **and** sets the `stack.<type>` entry for you; otherwise write the `stack.<type>` entry into `.refact-os.json` directly. For `asana.projectId`, accept `null` / "skip" / blank as an explicit opt-out — never leave the key absent.

### 2. Stack details (`.refact-os.json` › `stack.<type>`)

**Check:** Each `stack.<type>` entry has its `hosting`, `runtime`, and `environments` filled — or an explicit `null` / deliberate `{}` where not applicable. This is the **single home** for stack, hosting, and deploy facts; they are no longer duplicated in `agent/AGENTS.md`.

**Per-type fields:**

| Field | Example | Notes |
|---|---|---|
| `hosting` | `"kinsta"`, `"wpengine"`, `"vercel"`, `"netlify"` | Deploy provider for this type. |
| `runtime` | `"wp-env (PHP 8.2, MySQL 8)"`, `"Node 20 + pnpm"` | Local dev / runtime stack. |
| `environments.<env>` | keys like `production`, `staging` | One block per deployable environment; add others (e.g. `preview`) as needed. |

**Per-environment fields** (`stack.<type>.environments.<env>`):

| Field | Example | Notes |
|---|---|---|
| `url` | `"https://www.example.com/"` | Full URL including `https://`. |
| `branch` | `"main"`, `"stage"`, `"develop"` | Git branch that auto-deploys to this environment. |
| `install` | `"stlmagdev"` | **WP Engine only.** The WP Engine install name used in the deploy URL `git@git.wpengine.com:<install>.git`. Required when `hosting === "wpengine"`; omit otherwise. |
| `ssh` | `{ "user": "example", "host": "1.2.3.4", "port": 12345, "path": "/www/<env>/public" }` | **SSH hosts only** (Kinsta, WP Engine). Used by the `wp-env` skill to pull plugins/mu-plugins/DB from staging. Omit entirely for git-integration hosts (Vercel, Netlify). Never store the private **key** here — that's a CI secret. **Host conventions:** WP Engine SSH Gateway is `<install>.ssh.wpengine.net` on port **`22`** (port `2222` is WPE's SFTP service — `ssh`/`rsync`/`wp-cli` won't work there). Kinsta uses a per-env IP and a per-env 5-digit port from the User Portal. |

**Handle (if unmet):** Ask the user, one focused question at a time, for each type's `hosting` + `runtime` and at least its `production` (usually also `staging`) environment. Accept "skip" — leave the field `null` (or omit `ssh`) so it stays visibly outstanding without blocking init. Write directly into `.refact-os.json` and show the proposed change first. Collect **non-secret routing only** — SSH keys, tokens, and passwords belong in `.env` or the CI secret store, never here.

### 2b. Stack type-specific fields

**Check:** Each `stack.<type>` entry has its type-specific fields filled (not `null`).

**WordPress fields:**

| Field | Example |
|---|---|
| `phpVersion` | `"8.3"` |
| `wpVersion` | `"6.7"` |
| `theme.name` | `"example-theme"` |
| `theme.parent` | `"generatepress"` or `null` if no parent |
| `multisite` | `true` / `false` |
| `objectCache` | `"redis"`, `"memcached"`, or `null` |
| `pageCache` | `"kinsta-edge-cache"`, `"wp-super-cache"`, or `null` |

**Next.js fields:**

| Field | Example |
|---|---|
| `router` | `"app"` or `"pages"` — **ask first**, it changes everything |
| `nextVersion` | `"15.2"` |
| `packageManager` | `"npm"`, `"pnpm"`, `"yarn"` |
| `contentSource` | `{ "provider": "contentful" }` or `null` |

**Handle (if unmet):** Ask the user. Accept `null` / "skip" for anything not applicable. Write into `.refact-os.json` via `update-project-config`.

### 2c. Operations commands (`.refact-os.json` › `operations`)

**Check:** `operations.install`, `operations.dev`, `operations.test`, `operations.build`, `operations.deploy` are filled. Many are auto-detected from `package.json` scripts by `init`.

**Handle (if unmet):** Ask only for the commands that are still `null`. For monorepos or non-npm projects, the full command matters (e.g. `"cd apps/api && npm run dev"`). Accept "skip" / `null` for deploy if there is no standard command.

### 2d. `apps` (`.refact-os.json` › `apps`)

**Check:** `apps` is not empty. At minimum one entry exists describing the main app (or each app in a monorepo).

Each entry should have at minimum: `name`, `path`, `role` (one sentence), `hosting`, `runtime`. Add `readme`, `envExample`, `deploy` when known.

**Handle (if unmet):** Ask the user to describe the app(s). For a monorepo, one entry per workspace. Write directly into `.refact-os.json`.

### 3. `.env` file

**Check:** `.env` exists at the project root. (`.env.example` is always shipped; we just want the local copy.)

**Handle (if unmet):** Hand off to the `sync-env-vars` skill and let handle the environment variables.

### 4. Git repository + GitHub remote

**Check:**

- `.git/` exists at the project root.
- There is at least one commit (`git rev-parse --verify HEAD` succeeds).
- A remote named `origin` exists and points at a GitHub URL (`git remote get-url origin` returns a github.com URL).

**Handle (if unmet):** Delegate to `agent/skills/git-it/SKILL.md`. Run that flow exactly as documented there. Do not duplicate its prompts here — re-use the four questions (project name, slug, visibility, owner).

### 5. WordPress app slot (WordPress projects only)

**Skip this check** if `.refact-os.json` › `stack` has no `wordpress` entry.

**Check:** `apps/wordpress/` exists and contains `wp-content/plugins/`, `wp-content/themes/`, and `wp-content/mu-plugins/`.

**Handle (if unmet):** Delegate to `agent/skills/add-codebase/SKILL.md` with the argument `wordpress` (i.e. follow Flow B in that reference). After it runs, re-check the directory layout.

### 6. WordPress agent skills (WordPress projects only)

**Skip this check** if `.refact-os.json` › `stack` has no `wordpress` entry.

**Check:** `.cursor/skills/wp-block-development/SKILL.md` exists. (Presence of this one is the cheap proxy for "the WP curated set has been installed at least once.")

**Handle (if unmet):** Ask the user whether they want to install the curated WP skills now — it's optional and they may prefer to defer. If yes, delegate to `agent/skills/install-wp-skills/SKILL.md`. If no, mark the checkbox as user-deferred and move on; do not re-prompt on the next init run unless the user re-asks.

### 7. Auto-deploy workflows (WordPress + SSH host only)

**Skip this check** if `.refact-os.json` › `stack` has no `wordpress` entry, **or** if `stack.wordpress.hosting` is neither `kinsta` nor `wpengine`.

**Check:** A `.github/workflows/wordpress-deploy-*.yml` file exists for each `stack.wordpress.environments.<env>` whose `branch` is set. (Concretely: a `kinsta` project usually has `wordpress-deploy-stage.yml` + `wordpress-deploy-main.yml`; a `wpengine` project usually adds `wordpress-deploy-develop.yml` as well.)

**Handle (if unmet):** Ask the user whether they want to create the auto-deploy workflows now — it requires host-side SSH keys and GitHub Actions secrets, so they may want to defer. If yes:

- `stack.wordpress.hosting === "kinsta"` → delegate to `agent/skills/setup-kinsta-deploy/SKILL.md`.
- `stack.wordpress.hosting === "wpengine"` → delegate to `agent/skills/setup-wpengine-deploy/SKILL.md`.

If no, mark as user-deferred and move on.

### 8. agent/AGENTS.md drift warning (post-update only)

**Check:** The most recent scaffold run did **not** emit `⚠  agent/AGENTS.md template has changed upstream.`. (This warning is documented in `update-package.md` and stored hash-wise in `.refact-os.json` › `_scaffold.templateHashes`.)

This check is informational — there's nothing to "fix". If the warning fired during a recent `/refact update the package` run and the user hasn't yet reviewed the diff, remind them: read `node_modules/refact-os/templates/AGENTS.md`, diff against the project's `agent/AGENTS.md`, and merge new sections by hand.

## Output shape

After running through the checklist, print a single summary:

```
init checklist:
  [x] project identity (name, kind, branches)
  [x] .refact-os.json stack + asana
  [x] stack details (hosting/runtime/envs)
  [x] stack type-specific fields (php/theme or router/packageManager)
  [x] operations commands
  [x] apps[]
  [x] .env file
  [x] git + GitHub remote
  [x] apps/wordpress/                (wordpress only)
  [-] WordPress agent skills          (deferred by user)
  [x] Auto-deploy workflows           (wordpress + kinsta/wpengine only)
  [x] agent/AGENTS.md drift           (no pending warning)
```

Mark items as:
- `[x]` met — handled successfully or already passing
- `[-]` user-deferred — user declined to handle now
- `[ ]` unmet and unresolved (only if the user aborted mid-step or a delegation failed)

Surface unresolved items at the bottom with the suggested next action.

## Guardrails

- **Idempotent.** Re-running init on a fully-configured project must do nothing. Never re-prompt for a value that is already set.
- **No silent edits.** Never write to `.refact-os.json` or `.env` without confirming with the user what is being set. Show the proposed change first.
- **Delegate, don't duplicate.** For git, WP skills, WordPress scaffold, and Kinsta setup, follow the existing references step-for-step. Do not reimplement their logic here.
- **Never** invent values for the user. If they don't know a value, accept "skip" and leave the field `null` (or omit an optional block like `ssh`) so it stays visibly outstanding.
- **Never** edit `REFACT.md` from this flow — it's agency-wide and not project-specific.
- If any single step fails, stop and report. Do not continue past a failed step — later checks may depend on it (e.g. `.env` before WP skills, git before any deploy setup).
