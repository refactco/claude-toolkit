---
name: sync-env-vars
description: Handle environment variables and secrets configuration. Sync project environment variables between the local env file and the team's 1Password item, mirroring the newer source and regenerating .env.example. Load this skill whenever the conversation touches environment variables, .env / .env.example files, env vars, secrets, or related configuration.
pattern: procedure
when_to_use: Whenever the chat discusses environment variables, .env or .env.example files, env vars, secrets, or config keys; user says sync env, setup env, generate env, push env, or pull env; .env is missing or stale; run/build/test fails due to env vars; env vars are added, removed, or renamed; .env.example changes; before committing env-related changes.
when_not_to_use: Committing secret values into the repo (never); writing the vault without per-key/replacement confirmation; managing env vars for a WordPress app (handled separately by the WordPress env tooling).
next_skills: []
sub_agents: []
---

# Sync Env Vars

## What This Skill Does

Keep the two value sources for a project aligned:

- The local `.env` file.
- The team's 1Password project item in the fixed `Env Variables & Secrets` vault.

`.env.example` is metadata and a shareable key declaration. It carries the 1Password headers and key names, but it is not a value source and must not decide which values are pulled into `.env`.

## Default First Action — Always Sync Before Asking

Whenever `.env` is missing, stale, or the app fails due to env vars, the first action is **always** to run `${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh sync`. The sync command is itself the proactive 1Password lookup — it checks the team vault, finds the project item, and creates or updates `.env` from it.

**Never** ask the user "do you have an `.env` or a 1Password item?" before running sync. That question is what sync answers. Only fall back to asking the user for values *after* sync has run and reported that neither `.env` nor a 1Password item exists (see "First-Run Flow").

## Where The Env File Goes

The env file belongs next to the app that reads it (e.g. `dashboard/.env`), **not** automatically at the repo root. `sync` resolves this location itself, so you normally just run the command without specifying paths. The directory is chosen with two simple rules, stopping at the first that yields candidates:

1. **Any existing `.env.example` or `.env`** — use its directory (the `.env.example` wins because it declares the keys).
2. **Otherwise, the directory where env vars are read** — using the exact accessor patterns from "Codebase Discovery Search Method" below. The file goes in the top-level directory where those accessors live.

If neither rule finds anything, it falls back to the repo root. Searches always ignore `node_modules`, `.git`, `.next`, `dist`, `build`, `vendor`, any WordPress app directory (detect it from the repo, or ask the user — e.g. `apps/<name>` in a monorepo), `.claude`, and `agent`. The `.claude` and `agent` root folders are tooling/skill directories — they are never var accessors and must not influence env file placement. The chosen path is printed as `Env location: <dir>` at the top of every run.

If a rule finds **more than one** candidate directory, the location is ambiguous: the script stops and lists them. Ask the user which one, then pin it explicitly:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh sync --env-file <dir>/.env --example-file <dir>/.env.example
```

Required headers:

```bash
# 1password_vault: Env Variables & Secrets
# 1password_project: <item title built from the rules below>
```

Default item suffix is `Local` unless the user request or env file clearly targets another environment.

### 1Password Item Naming Rules

The 1Password item title is derived from where the `.env.example` (or `.env`) lives in the repo and the target environment. Always build the title using PascalCase segments and one of these three shapes:

1. **Root-level `.env.example`** (file lives at the repo root):

   ```
   <ProjectNamePascalCase> - <Environment>
   ```

   Example: `MyProject - Local`

2. **Under `apps/<app-name>/`** (file lives directly under an `apps/` subdirectory):

   ```
   <ProjectNamePascalCase>/<AppNamePascalCase> - <Environment>
   ```

   Example: `MyProject/Dashboard - Local`

3. **Other nested locations** (file is not at the root and not under `apps/`): use the immediate parent folder name.

   ```
   <ProjectNamePascalCase>/<ParentFolderNamePascalCase> - <Environment>
   ```

   Example: `MyProject/AdminPanel - Local`

Conventions:

- `<ProjectNamePascalCase>` is the repo root folder name converted to PascalCase (e.g. `refact-os` → `RefactOs`, `my_project` → `MyProject`).
- `<AppNamePascalCase>` and `<ParentFolderNamePascalCase>` are the relevant directory names converted the same way (e.g. `admin-panel` → `AdminPanel`).
- `<Environment>` is `Local`, `Staging`, or `Production`. Default to `Local` unless the user or the env file clearly targets another environment.
- Always pass the built title to the script via `--project "<title>"` (or set `PROJECT_ITEM`) on first run so the header is written correctly. Once `# 1password_project:` is in `.env.example`, the script reuses it.

## Preconditions

Run once per session before syncing:

```bash
command -v op || echo "NO OP CLI"
command -v jq || echo "NO JQ"
op whoami
```

Handle setup with minimal follow-up questions:

- If `op` is not installed, install it automatically without asking. On macOS run `brew install 1password-cli`; on Linux follow 1Password's package instructions for the detected distro. Re-run `op whoami` afterward. Only stop to ask the user if installation fails, such as missing `brew` or missing `sudo`.
- If `jq` is not installed, install it automatically without asking. On macOS run `brew install jq`; on Linux use the detected distro's package manager. `jq` is required by `sync-env.sh`.
- If `op whoami` fails, the agent has no vault access. **Do not** surface a raw CLI error. Instead, relay the guided, step-by-step onboarding below (the script also prints these exact steps) and reassure the user this is a one-time setup:

  > You're not connected to 1Password yet — let's fix that. It takes about 30 seconds:
  > 1. Open your **1Password app**.
  > 2. Open the **Refact** vault.
  > 3. In the search box, type: **Service Account Auth Token: refact-os**
  > 4. Open that item and **copy its token value** (it starts with `ops_`).
  > 5. **Paste the token back here in the chat** and I'll wire it into your shell for you.
  >
  > You only need to do this once — future sessions reuse it. Your token is never logged or echoed back; it only goes into `~/.zshrc`.

- When the user provides the token, add it directly to `~/.zshrc` so future sessions inherit it; do not only export it for the current shell:

```bash
sed -i.bak '/^export OP_SERVICE_ACCOUNT_TOKEN=/d' ~/.zshrc
echo 'export OP_SERVICE_ACCOUNT_TOKEN="ops_..."' >> ~/.zshrc
source ~/.zshrc
```

Then rerun `op whoami` to confirm. Never hardcode, guess, log, or echo the token back to the user.

## Sandbox Restriction — Run Outside the Sandbox

Always run sync commands with `required_permissions: ["all"]`. If a run fails with a network/auth error, re-run outside the sandbox immediately.

## Normal Command

Use this as the primary action:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh sync
```

The sync command:

1. Finds or repairs `.env.example` headers.
2. Reads `.env` and the 1Password item.
3. Compares `.env` modified time with the 1Password item last-edited time.
4. Treats the newer value source as the complete current state.
5. Prints a **changes preview** — a clean confirmation table (see "Confirmation Table" below) showing every key that will be added, updated, or removed, the source and destination, and a masked before/after for each.
6. Mirrors the newer source to the older source, including additions, changes, and deletions.
7. Regenerates `.env.example` so its keys exactly match the final value source.

If `.env` is newer, the script stops after printing the changes preview unless vault writes were explicitly confirmed. Walk the user through the table (see "Confirmation Table"), get their approval for the listed add/update/remove actions, then rerun:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh sync --yes
```

Never pass `--yes` until the user has confirmed the vault write, overwrite, or deletion plan.

## Confirmation Table

Before any write, the script prints a confirmation table so the user fully understands what is about to happen. Always relay this table to the user (verbatim, or reformatted as a clean markdown table) and **wait for explicit approval** before rerunning with `--yes`. The table makes the following explicit:

- **ACTION** — `ADD` (new key), `UPDATE` (value changes), or `REMOVE` (key dropped from the destination).
- **KEY** — the environment variable name.
- **Source → Destination** — e.g. `.env → 1Password` or `1Password → .env`, plus the exact vault and item.
- **BEFORE / AFTER** — the current destination value vs. the incoming source value. Secrets are masked (first 2 characters + `****`); non-secret values show up to 20 characters. `-` means the value is absent on that side (so `-` in BEFORE = a brand-new key; `-` in AFTER = a removal).
- A one-line **summary** of how many keys will be added, updated, removed, and left unchanged.

Present it as a short, confidence-inspiring recap, for example:

> Here's exactly what this sync will do (`.env → 1Password`, item `RefactControl - Local`):
>
> | Action | Key | Before | After |
> |---|---|---|---|
> | ADD | `NEW_FLAG` | - | `true` |
> | UPDATE | `API_TOKEN` | `sk****` | `sk****` |
> | REMOVE | `OLD_SECRET_KEY` | `zz****` | - |
>
> That's 1 added, 1 updated, 1 removed, 4 unchanged. Nothing has been written yet — approve and I'll apply it.

For a pull (`1Password → .env`) the same table is shown; only the source and destination swap. If the table reports "No changes", tell the user the two sources already match and stop.

## When Agents Must Use It

Run env sync when:

- The user says "sync env", "generate env", "push env", "pull env", "setup env", or similar.
- `.env` is missing and the app needs environment variables.
- A run/build/test command fails due to missing, empty, or invalid env vars.
- You add, remove, or rename env vars in code.
- `.env.example` changes locally or after pulling/rebasing.
- The user edits `.env` and wants the change shared.
- Before committing, if env-related files or env usages changed.

## First-Run Flow

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh sync
```

Expected outcomes:

- If only the 1Password item exists, sync creates `.env` from the complete item and creates or repairs `.env.example`.
- If only `.env` exists, sync creates or replaces the 1Password item from the complete `.env` after user confirmation, then creates or repairs `.env.example`.
- If `.env.example` is missing, sync creates it from the chosen value source.
- If headers are missing, sync adds the fixed vault header and a project item title using `PROJECT_ITEM`, `--project`, an existing project header, or the default naming convention.

If — and only if — the sync run above reports that neither `.env` nor a 1Password item exists, the resolved directory (see "Where The Env File Goes") is where the env file should be created. Do not skip the sync run and jump straight to asking the user; the sync command is what determines whether a 1Password item is already there. Once sync confirms both sources are missing, ask the user to choose one bootstrap path:

1. Existing 1Password item: ask for the exact item title, then run `${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh sync --project "<exact item title>"`.
2. Existing `.env.example` with no values: the keys are already declared. Either collect values from the user to fill `.env`, or create `.env` with empty placeholders for the user to fill later. Never invent values.
3. Codebase discovery: scan the resolved directory for env vars, list the key names, collect values from the user, create `.env`, then run `${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh sync --yes` after the user confirms creating the 1Password item.

WordPress apps are excluded from this skill. Detect the WordPress app directory from the repo (or ask the user — e.g. `apps/<name>` in a monorepo). Their env vars are handled separately, so never scan, create, or manage `.env` or `.env.example` for the WordPress app. If WordPress is the only app in the repo, there is nothing for this skill to handle: stop and tell the user that env vars are managed by the separate WordPress env tooling (the `wp-config` flow).

### Codebase Discovery Search Method

Do not grep for bare uppercase words; that floods the results with constants, enum members, and SQL keywords. Instead, anchor each pattern to a known env accessor and capture the key name inside it. Use the captured group, validated as `[A-Z][A-Z0-9_]+`, as the candidate key. The same patterns drive env-file location resolution (rule 2 in "Where The Env File Goes").

Run from the resolved directory (the `Env location` the script printed, or `.` for the repo root), excluding tooling and build folders. `.claude` and `agent` are not app code — they hold skills, scripts, and agent config that reference accessor patterns only as documentation, so they must be excluded:

```bash
rg --no-filename -o -r '$1' \
  -e "process\.env\.([A-Z0-9_]+)" \
  -e "process\.env\[['\"]([A-Z0-9_]+)['\"]\]" \
  -e "import\.meta\.env\.([A-Z0-9_]+)" \
  -e "os\.environ(?:\.get)?\(['\"]([A-Z0-9_]+)['\"]" \
  -e "os\.getenv\(['\"]([A-Z0-9_]+)['\"]" \
  -e "getenv\(['\"]([A-Z0-9_]+)['\"]" \
  -e "ENV\[['\"]([A-Z0-9_]+)['\"]\]" \
  -e "\benv\(['\"]([A-Z0-9_]+)['\"]" \
  <dir> \
  --glob '!<wordpress-app-dir>/**' \
  --glob '!.claude/**' \
  --glob '!agent/**' | sort -u
```

Notes:

- Framework-prefixed keys such as `NEXT_PUBLIC_` and `VITE_` are already covered because they remain uppercase.
- Dynamic access such as `process.env[varName]` uses a computed key that cannot be captured. Flag these for manual review instead of guessing the name.
- Treat the de-duplicated output as the candidate key list, then collect values from the user. Never invent values for discovered keys.
- **Never filter out a discovered key because it has a hardcoded fallback value in the source code** (e.g. `process.env.URL || 'http://localhost:4321'`). The fallback is a runtime default, not proof the key is unimportant. Present every discovered key to the user and let the user decide which ones to track.

Never invent missing values.

## Local Change Flow

Use when `.env` was edited or env vars were added, removed, or renamed locally.

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh sync
```

If `.env` was edited after the 1Password item, `.env` becomes the complete source for this sync run. The script prints the changes preview (the confirmation table described above) listing every key to add, update, or remove in 1Password with masked before/after values, then stops for confirmation. Relay the table, get approval, then rerun with `--yes`.

Empty values in `.env` are not pushed to 1Password. If the script reports empty local values, ask the user to fill them or remove those keys before syncing.

## Remote Or Shared Change Flow

Use when another developer changed the 1Password item, `.env.example` changed in a pulled commit, or the app fails because local env vars are missing or stale.

Run:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh sync
```

If the 1Password item was edited after `.env`, 1Password becomes the complete source. The script rewrites `.env` from the complete item, including additions, value changes, and removals, then regenerates `.env.example`.

## Direction, Conflicts, And Deletions

Direction rules:

- If only 1Password exists, generate `.env` from the complete item.
- If only `.env` exists, create or replace the 1Password item from the complete `.env` after confirmation.
- If both exist, compare the 1Password last-edited time with `.env` modified time.
- The newer source replaces the older source entirely for that sync run.
- If timestamps are equal, unavailable, or ambiguous, stop and ask the user which source should win, then rerun with `--source env` or `--source vault`.

Deletion is part of complete-source sync:

- If `.env` is newer and a key is missing from `.env`, remove that field from 1Password after confirmation.
- If 1Password is newer and a key is missing from the item, remove that key from `.env`.
- Regenerate `.env.example` after every successful sync so it has no extra or missing keys.
- Never delete anything when direction is ambiguous.

## Advanced/Internal Commands

These commands are for debugging or targeted recovery, not the normal user path:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh diff
${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh keys-diff
${CLAUDE_PLUGIN_ROOT}/skills/sync-env-vars/scripts/sync-env.sh push <KEY>
```

## Safety Rules

- Never commit `.env`.
- Never print full secret values; secret-like keys are masked to the first 2 characters plus `****` in the confirmation table, and full secret values must never be echoed.
- Never write secret literals into `.env.example`.
- Never invent missing values.
- Never replace 1Password values without explicit user confirmation.
- Never clear a vault value because local `.env` has an empty value.
- Never perform complete-source deletion when sync direction is ambiguous.
- Never use `.env.example` as the value source or as a filter for pulling values from 1Password.
- Never echo `OP_SERVICE_ACCOUNT_TOKEN` or any secret value back to the user.
