---
name: wp-env
description: Manage the local WordPress stack via wp-env — setup, pull plugins/mu-plugins/db from staging, reset, custom local domain.
pattern: procedure
when_to_use: /refact wp-env setup [--with-tests] | pull [plugins|mu-plugins|db] | reset | domain <host>.
when_not_to_use: Non-WordPress projects.
next_skills: []
sub_agents: []
---

# wp-env Reference

Use this reference when the user invokes any of:

- `/refact wp-env setup [--with-tests]` — bring up a fresh local WordPress stack and, in the same flow, optionally pull plugins/mu-plugins + DB from staging and set a local domain. Idempotent: each sub-step is verified independently and skipped silently if already met, so re-running on a fully-configured project is a no-op. By default, the tests instance is stopped to save resources; pass `--with-tests` to keep it running.
- `/refact wp-env pull` — alias for **pull plugins + mu-plugins + db** (staging → local).
- `/refact wp-env pull plugins`
- `/refact wp-env pull mu-plugins`
- `/refact wp-env pull db`
- `/refact wp-env pull wp-config` — read staging `wp-config.php` and extract application constants into local config files.
- `/refact wp-env reset` — destroy containers + volumes and rebuild from scratch.
- `/refact wp-env domain set <hostname>` — front the local env with a `.local` hostname over HTTPS via Caddy.
- `/refact wp-env domain clear` — remove the hostname mapping and revert to `http://localhost:8888`.

## What this does

Manages the local WordPress development stack. Local code lives under the **WordPress app directory** — detect it from the repo (the folder containing `wp-content/`), or ask the user. In a monorepo this is `apps/<name>` (commonly `apps/wordpress/`); in a single-app repo it may be the repo root. **This skill uses `apps/wordpress/` in its examples as the monorepo default — substitute your detected path throughout.** That tree is the same one the Kinsta and WP Engine deploy workflows push (see [`setup-kinsta-deploy`](../setup-kinsta-deploy/SKILL.md) / [`setup-wpengine-deploy`](../setup-wpengine-deploy/SKILL.md)). The local env mirrors staging by pulling plugins, mu-plugins, and the DB over SSH using the routing in `.refact-os.json` › `stack.wordpress.environments.staging`.

## Canonical layout

```
<project-root>/
├── .wp-env.json                          ← wp-env config (created by setup)
├── apps/wordpress/
│   └── wp-content/
│       ├── plugins/                      ← rsync target for `pull plugins`
│       ├── themes/                       ← (not pulled by default — usually in-repo)
│       └── mu-plugins/                   ← rsync target for `pull mu-plugins`
└── package.json                          ← gets `wp:*` scripts on setup
```

`.wp-env.json` maps `wp-content/{plugins,themes,mu-plugins}` from inside `apps/wordpress/wp-content/` so the container sees the same files the deploy workflow ships. **Never** create a parallel `./wp-content/` at the repo root — it splits the source of truth and breaks the Kinsta deploy filter.

## Optional local domain (`<project>.local`)

wp-env binds to `127.0.0.1:8888` by default. To use a hostname like `https://website.local` instead, this flow can layer a [Caddy](https://caddyserver.com) reverse proxy on top: Caddy issues a trusted local cert via its own CA, fronts wp-env on `:443`, and you get clean URLs without ports.

The hostname is stored at `.refact-os.json` › `wpEnv.localDomain` so every teammate gets the same URL after `/refact wp-env setup`. Per-project Caddy config lives outside the repo at `~/.refact/caddy/<project-slug>.caddyfile`, imported by a global `~/.refact/Caddyfile`. See **Step 4 — `domain set` / `domain clear`** below.

---

## Preflight (always)

1. `.refact-os.json` › `stack` has a `wordpress` entry. If not, stop and ask the user to confirm — this flow is WordPress-specific.
2. The WordPress app directory exists (detect it from the repo — the folder containing `wp-content/` — or ask the user; e.g. `apps/<name>` in a monorepo, commonly `apps/wordpress/`). If it doesn't exist yet, ask the user where the WordPress code should live (or to create it), then continue.
3. Docker is reachable: `docker info` exits 0. If not, stop and tell the user to start Docker Desktop / Colima.
4. Node is **18+**: `node --version`. wp-env requires it.

For `pull` flows only — also verify `.refact-os.json` › `stack.wordpress.environments.staging` has its `ssh` block (user/host/port/path) and `url` filled. If the `ssh` block is missing or any of its fields are absent, stop and ask the user to fill it in `.refact-os.json` — that file is the deploy/SSH source of truth.

---

## Step 1 — `setup`

Idempotent. Each sub-step is verified independently; skip silently if already met.

### 1a. Ensure `apps/wordpress/wp-content/` subfolders

```bash
mkdir -p apps/wordpress/wp-content/plugins
mkdir -p apps/wordpress/wp-content/themes
mkdir -p apps/wordpress/wp-content/mu-plugins
```

### 1b. Write `.wp-env.json` (skip if present)

If `.wp-env.json` already exists, **inspect it**:

- If it maps `wp-content/*` from `./apps/wordpress/wp-content/*` — leave the mappings alone. If a Caddy domain is configured, make sure neither `.wp-env.json` nor `.wp-env.override.json` defines `config.WP_HOME` / `config.WP_SITEURL`; see Step 3.
- If it maps from `./wp-content/*` (the legacy layout) — show the diff and ask the user before rewriting. Some older scaffolds had `wp-content/` at the root; the new convention is `apps/wordpress/wp-content/` so deploy and local share one tree.

Resolve the local URL **before** writing the config block:

- If `.refact-os.json` › `wpEnv.localDomain` is set → `LOCAL_URL="https://<that-host>"`.
- Otherwise → `LOCAL_URL="http://localhost:8888"`.

Template body when creating:

```json
{
  "$schema": "https://schemas.wp.org/trunk/wp-env.json",
  "core": null,
  "phpVersion": "8.2",
  "themes": [],
  "plugins": [],
  "mappings": {
    "wp-content/plugins":    "./apps/wordpress/wp-content/plugins",
    "wp-content/themes":     "./apps/wordpress/wp-content/themes",
    "wp-content/mu-plugins": "./apps/wordpress/wp-content/mu-plugins"
  },
  "config": {
    "WP_DEBUG": true,
    "WP_DEBUG_LOG": true,
    "WP_DEBUG_DISPLAY": false,
    "SCRIPT_DEBUG": true,
    "WP_ENVIRONMENT_TYPE": "local"
  }
}
```

If `wpEnv.port` is already set in `.refact-os.json` (e.g. `domain set` ran before setup, or setup is being re-run), also add `"port": <N>` as a top-level key alongside `"phpVersion"`. Omit it otherwise — wp-env defaults to `8888` until `domain set` assigns a unique port.

Omit `WP_HOME` / `WP_SITEURL` from `.wp-env.json` (committed). When Caddy is in use, add them to `.wp-env.override.json` (gitignored) so plugins that read the PHP constants directly get the correct hostname:

```json
{
  "config": {
    "WP_HOME": "https://<hostname>",
    "WP_SITEURL": "https://<hostname>"
  }
}
```

wp-env will append `:8888` to these values (e.g. `https://<hostname>:8888`), but the local-only mu-plugin from Step 3 strips the port from all URL outputs. This two-layer approach — constants for plugins that read them directly, plus mu-plugin filters for WordPress API consumers — catches the widest range of URL generation patterns.

### 1c. Install `@wordpress/env`

If `@wordpress/env` is missing from `package.json` › `devDependencies`:

```bash
npm install --save-dev @wordpress/env
```

### 1d. Add `wp:*` scripts to `package.json`

Add only the ones missing — never overwrite existing entries:

| Script | Command |
|---|---|
| `wp:start` | `wp-env start` |
| `wp:stop` | `wp-env stop` |
| `wp:destroy` | `wp-env destroy` |
| `wp:clean` | `wp-env clean all` |
| `wp:logs` | `wp-env logs all` |
| `wp:cli` | `wp-env run cli wp` |
| `wp:shell` | `wp-env run cli bash` |

### 1e. Start the stack

```bash
npx wp-env start
```

First run downloads images and may take a few minutes. If it fails on `port already in use`, surface the exact error — don't guess at an alternate port without asking.

**Tests containers (disabled by default):** wp-env always creates a parallel "tests" WordPress instance (extra containers + images) intended for PHPUnit/integration testing. Most engagement projects don't need it, so **by default this flow stops the tests containers** immediately after startup:

```bash
docker stop $(docker ps -q --filter "name=$(basename "$PWD")" --filter "name=tests")
```

If the user passes `--with-tests`, skip stopping the tests containers and persist the preference in `.refact-os.json` › `wpEnv.withTests: true` so subsequent `wp-env start` invocations (including from `reset` and `domain set`) keep the tests containers running. If `.refact-os.json` › `wpEnv.withTests` is `true`, behave as if `--with-tests` was passed.

**Existing projects (already have tests containers running):** If `.refact-os.json` has no `wpEnv.withTests` key at all, the default applies — stop the tests containers on the next `setup` or `start`. No data is lost — the tests instance uses its own DB volume separate from the dev instance.

After stopping the tests containers, prompt the user: *"Tests containers stopped. Remove the tests Docker images to free disk space (~1–2 GB)? You can always re-pull them later with `--with-tests`. [y/N]"*. On yes:

```bash
docker rm $(docker ps -aq --filter "name=$(basename "$PWD")" --filter "name=tests")
docker rmi $(docker images --filter "reference=*tests*" -q) 2>/dev/null || true
```

On no (or if the user just presses enter), leave the images cached — they cost disk but make `--with-tests` instant if needed later.

### 1f. Disable outgoing emails

Idempotent. Install and activate the [`disable-emails`](https://wordpress.org/plugins/disable-emails/) plugin so the local stack never sends real mail. Skip silently if the plugin is already active.

```bash
npx wp-env run cli wp plugin is-installed disable-emails \
  || npx wp-env run cli wp plugin install disable-emails
npx wp-env run cli wp plugin is-active disable-emails \
  || npx wp-env run cli wp plugin activate disable-emails
```

The plugin files land in `apps/wordpress/wp-content/plugins/disable-emails/`. Because this plugin is local-only (it doesn't exist on staging), the `pull plugins` rsync excludes it — see Step 2b.

### 1g. Report

Print to the user:

- Site URL: `<LOCAL_URL>` (the value resolved in 1b — either `https://<domain>` or `http://localhost:8888`).
- Admin URL: `<LOCAL_URL>/wp-admin` — login `admin` / `password` (wp-env defaults).
- Test connectivity: `npm run wp:cli -- --info`.

If a domain is configured but Caddy isn't running yet, also remind the user to run `/refact wp-env domain set <hostname>` (or, if already set, `caddy start --config ~/.refact/Caddyfile` to bring the proxy up).

Also confirm the `disable-emails` plugin is active: `npx wp-env run cli wp plugin is-active disable-emails`. If not, surface and point to Step 1f.

### 1h. One-shot post-start checklist

The container is up. Walk this **idempotent checklist** so the user gets to a usable, populated local site in one command. Each item is independent: verify the condition, skip silently if already met, otherwise ask the user a single yes/no and delegate to the documented sub-flow. Re-running `/refact wp-env setup` on a fully-configured project does nothing.

The values prompted for here persist into `.refact-os.json`, so the next teammate who clones the repo and runs `/refact wp-env setup` is asked **none** of them.

#### Checklist

1. **Pull plugins + mu-plugins from staging.**
   - Skip silently if `apps/wordpress/wp-content/plugins/` contains any directory other than `.gitkeep` (i.e. there's already at least one plugin checked in or pulled).
   - Otherwise ask: *"Pull plugins and mu-plugins from staging now? [Y/n]"*. On yes, run Step 2b (`pull plugins`) followed by Step 2c (`pull mu-plugins`). On no, mark as user-deferred and continue.
   - Preflight is shared: if Step 2a's SSH check fails, surface and stop the checklist here.

2. **Pull staging DB.**
   - Skip silently if `npm run wp:cli -- option get siteurl` returns anything other than wp-env's default (`http://localhost:8888` or `https://localhost:8888`). Any non-default value means the DB has already been imported.
   - Otherwise ask: *"Pull the staging database now? This rewrites local URLs from `<STAGING_URL>` → `<LOCAL_URL>` and resets the admin password. [Y/n]"*. On yes, run Step 2d (`pull db`). On no, mark as user-deferred.

3. **Set a local domain.**
   - Skip silently if `.refact-os.json` › `wpEnv.localDomain` is already set. (If it is set but Caddy isn't running, the message printed in 1g covers that.)
   - Otherwise ask: *"Front the local stack with a `.local` hostname over HTTPS (recommended)? Leave blank to keep `http://localhost:8888`."*. If the user provides a hostname, run Step 3b (`domain set <hostname>`). If they leave it blank or decline, persist nothing (so the next teammate gets the same prompt — they may want a domain even if this user doesn't).

4. **Configure uploads fallback to staging.** Runs only when (2) just happened or had already run — uploads fallback only makes sense when the DB references the staging media tree. Idempotent.
   - Skip silently if `apps/wordpress/wp-content/mu-plugins/02-wp-env-uploads-fallback.php` exists *and* `.wp-env.override.json` › `config.WP_ENV_UPLOADS_FALLBACK_URL` is set.
   - Skip silently if `.refact-os.json` › `stack.wordpress.environments.staging.url` is not set (nothing to fall back to).
   - Otherwise run Step 2d Phase 6 (`Configure uploads fallback to staging`) to write the mu-plugin and the constant, then restart wp-env. No prompt — this is purely a local-dev quality-of-life fix; if you don't want it, delete the mu-plugin file afterwards.

#### Output

After the checklist, print a single summary, in the same shape `setup-project` uses:

```
wp-env setup checklist:
  [x] containers up                       (wp-env start)
  [x] outgoing emails disabled            (disable-emails plugin active)
  [x] plugins + mu-plugins pulled         (or [-] deferred / [-] already populated)
  [x] staging DB imported                 (or [-] deferred / [-] already populated)
  [x] local domain set                    (or [-] deferred / [-] not requested)
  [x] uploads fallback configured         (or [-] no staging URL on file)
```

Use `[x]` for met, `[-]` for user-deferred or already-populated (don't re-prompt next run unless the user re-asks), and `[ ]` only for items that failed mid-step (with the suggested next action).

---

## Step 2 — `pull`

`/refact wp-env pull` runs **2b → 2c → 2d** in order. The single-target variants (`pull plugins` / `pull mu-plugins` / `pull db`) run just that step. All variants share the preflight in 2a.

### 2a. Resolve SSH target from `.refact-os.json`

Read `.refact-os.json` › `stack.wordpress.environments.staging`. (For projects whose staging env is keyed differently — e.g. `stage` — fall back to that key; never default to `production`.) Map the fields:

| `.refact-os.json` path | Variable |
|---|---|
| `…environments.staging.ssh.user` | `SSH_USER` |
| `…environments.staging.ssh.host` | `SSH_HOST` |
| `…environments.staging.ssh.port` | `SSH_PORT` (host-specific — see below) |
| `…environments.staging.ssh.path` | `DOC_ROOT` (the WordPress install root, relative to the SSH user's home; e.g. `sites/<install>` on WP Engine, `/www/<dir>/public` on Kinsta) |
| `…environments.staging.url` | `STAGING_URL` |

If `stack.wordpress.environments.staging.ssh` is absent (or any of `user`/`host`/`port`/`path` is missing), stop and ask the user to fill it in `.refact-os.json` — that file is the single source of truth.

**Host-specific port conventions** (fill `ssh.port` accordingly, and reject mismatches):

| Hosting | SSH host | SSH port | Notes |
|---|---|---|---|
| `wpengine` | `<install>.ssh.wpengine.net` | **`22`** | WP Engine **SSH Gateway** (shell, wp-cli, rsync). Port `2222` is **SFTP only** (`<install>.sftp.wpengine.net`, a separate service) — `ssh`/`rsync`/`wp-cli` will time out or be refused on `2222`. If `.refact-os.json` has `port: 2222` for a `wpengine` env, correct it to `22` before continuing. |
| `kinsta` | per-env IP | per-env port (from the Kinsta User Portal — typically a 5-digit port, different for staging vs production) | Kinsta SFTP/SSH is one service on the same port; copy the value the User Portal shows. |

Build the SSH connection string:

```bash
SSH_TARGET="${SSH_USER}@${SSH_HOST}"
SSH_OPTS="-p ${SSH_PORT}"
```

Verify the connection before doing anything destructive:

```bash
ssh ${SSH_OPTS} "${SSH_TARGET}" "test -d '${DOC_ROOT}/wp-content' && echo ok"
```

If it doesn't print `ok`, stop. Common causes: wrong port (on WP Engine, port `2222` is SFTP — use `22` for the SSH Gateway), SSH key not registered with the host, doc root path wrong.

> **Production guard.** This flow only ever pulls from **staging**. If the user explicitly asks to pull from production, refuse and explain the safer path: pull staging instead, or have the user export a sanitized DB from prod manually. Production WP-CLI requires explicit owner approval.

### 2b. Pull `plugins`

```bash
rsync -avz --delete \
  -e "ssh ${SSH_OPTS}" \
  --exclude='index.php' \
  --exclude='disable-emails/' \
  "${SSH_TARGET}:${DOC_ROOT}/wp-content/plugins/" \
  apps/wordpress/wp-content/plugins/
```

Notes:

- `--delete` mirrors staging exactly. Warn the user once: "this removes any local-only plugins under `apps/wordpress/wp-content/plugins/`. Confirm?" If they decline, drop `--delete`.
- `disable-emails/` is excluded because it is a local-only plugin installed by Step 1f — it doesn't exist on staging and must survive the sync.
- Some hosts inject plugins that don't belong in the repo (e.g. `kinsta-mu-plugins` lives in `mu-plugins/`, not here, so it shouldn't appear; but check). Don't auto-exclude anything beyond `index.php` and `disable-emails/` without asking.
- After the rsync, remind the user to inspect `git status` for new tracked paths in `apps/wordpress/wp-content/plugins/`. If something new should reach the host on deploy, the nested `apps/wordpress/.gitignore` needs an explicit `!` exception — see the project's deploy skill (`setup-kinsta-deploy` or `setup-wpengine-deploy`) § "Adding new tracked files under `apps/wordpress/`".

### 2c. Pull `mu-plugins`

Build the rsync exclude list from two sources: local-only files that must never be deleted by `--delete`, and host-injected system mu-plugins that aren't useful locally. Read `hosting` from `.refact-os.json` › `stack.wordpress.hosting` to select the right set.

**Always exclude (local-only wp-env helpers):**

The `0[0-9]-wp-env-*.php` prefix range is reserved for mu-plugins this skill writes (URL rewriter, local-config bridge, uploads fallback, etc.). They're all gitignored and must never deploy or be overwritten by a staging pull.

```
--exclude='index.php'
--exclude='00-wp-env-*.php'
--exclude='01-wp-env-*.php'
--exclude='02-wp-env-*.php'
--exclude='03-wp-env-*.php'
--exclude='04-wp-env-*.php'
--exclude='05-wp-env-*.php'
--exclude='06-wp-env-*.php'
--exclude='07-wp-env-*.php'
--exclude='08-wp-env-*.php'
--exclude='09-wp-env-*.php'
```

(rsync's `--exclude` doesn't support POSIX character classes like `0[0-9]-…` — list each prefix explicitly, or pass `--filter='- 0[0-9]-wp-env-*.php'` which does support globs.)

**Host-specific excludes:**

| Hosting | Exclude patterns |
|---|---|
| `kinsta` | `kinsta-mu-plugins/`, `kinsta-mu-plugins.php` |
| `wpengine` | `mu-plugin.php`, `force-strong-passwords/`, `slt-force-strong-passwords.php`, `wpe-cache-plugin*`, `wpe-update-source-selector*`, `wpe-wp-sign-on-plugin*`, `wpengine-common/`, `wpengine-security-auditor.php` |
| Other | Ask the user if unrecognized system mu-plugins are detected |

Example for a WP Engine project:

```bash
rsync -avz --delete \
  -e "ssh ${SSH_OPTS}" \
  --exclude='index.php' \
  --filter='- 0[0-9]-wp-env-*.php' \
  --exclude='mu-plugin.php' \
  --exclude='force-strong-passwords/' \
  --exclude='slt-force-strong-passwords.php' \
  --exclude='wpe-cache-plugin*' \
  --exclude='wpe-update-source-selector*' \
  --exclude='wpe-wp-sign-on-plugin*' \
  --exclude='wpengine-common/' \
  --exclude='wpengine-security-auditor.php' \
  "${SSH_TARGET}:${DOC_ROOT}/wp-content/mu-plugins/" \
  apps/wordpress/wp-content/mu-plugins/
```

These host-injected mu-plugins are managed server-side; they aren't useful locally and shouldn't end up in git. If you spot an unrecognized system mu-plugin (owned by `root` or `nobody`, or matching a known hosting vendor pattern), ask the user before adding it to the exclude list.

### 2d. Pull `db`

The local stack **must be running** for this step. If `npx wp-env run cli wp core is-installed` errors, run `npx wp-env start` first.

Resolve `LOCAL_URL` the same way Step 1b does: `https://<wpEnv.localDomain>` if it's set in `.refact-os.json`, otherwise `http://localhost:8888`.

Use a dump-to-file approach. Piping SSH export directly into `wp-env run cli wp db import -` can stall on databases larger than ~500 MB because Docker's stdin buffering saturates before the import catches up.

#### Phase 1 — Read the table prefix from staging

Many managed hosts (especially WP Engine) use a non-standard table prefix (e.g. `wp_qgp9spkuot_` instead of `wp_`). Fetch it from the staging `wp-config.php` before exporting:

```bash
TABLE_PREFIX=$(ssh ${SSH_OPTS} "${SSH_TARGET}" \
  "cd '${DOC_ROOT}' && wp config get table_prefix")
```

If the prefix is the standard `wp_`, no normalization is needed — skip Phase 2 below.

#### Phase 2 — Export only the real tables

When the prefix is non-standard, the database also contains vestigial default `wp_*` tables from the original WordPress install. Export **only** the tables matching the real prefix to avoid conflicts:

```bash
mkdir -p .wp-env-dumps
ssh ${SSH_OPTS} "${SSH_TARGET}" \
  "cd '${DOC_ROOT}' && wp db export --tables=\$(wp db tables --all-tables-with-prefix --format=csv) --single-transaction -" \
  > .wp-env-dumps/staging.sql
```

`wp db tables --all-tables-with-prefix` returns only the tables that match the configured `$table_prefix`, cleanly skipping the default `wp_*` leftovers.

If the prefix is non-standard, rename it to `wp_` so wp-env can read the tables:

```bash
sed "s/${TABLE_PREFIX}/wp_/g" .wp-env-dumps/staging.sql \
  > .wp-env-dumps/staging-final.sql
```

If the prefix is already `wp_`, just copy the dump as-is:

```bash
cp .wp-env-dumps/staging.sql .wp-env-dumps/staging-final.sql
```

#### Phase 3 — Import

```bash
npx wp-env run cli wp db reset --yes
cat .wp-env-dumps/staging-final.sql \
  | npx wp-env run cli -- wp db import -
```

#### Phase 4 — URL search-replace

Run search-replace for **all** known URL variants of the staging and production sites. Many staging databases contain URLs from multiple environments (e.g. both the staging domain and the production domain). Check all of these:

- The staging `url` from `.refact-os.json`
- The WP Engine `*.wpenginepowered.com` variant (if hosting is `wpengine`)
- The production `url` from `.refact-os.json`

```bash
npx wp-env run cli wp search-replace "${STAGING_URL}" "${LOCAL_URL}" \
  --skip-columns=guid --all-tables

# Also catch production URLs that leaked into the staging DB:
npx wp-env run cli wp search-replace "${PRODUCTION_URL}" "${LOCAL_URL}" \
  --skip-columns=guid --all-tables
```

Print each `SOURCE → TARGET` before running and ask the user to confirm. A bad replace can rewrite half the DB to the wrong host and is painful to undo.

#### Phase 5 — Post-import

```bash
npx wp-env run cli wp rewrite flush
npx wp-env run cli wp cache flush
rm -f .wp-env-dumps/staging*.sql
```

`wp rewrite flush` (soft — leaves `.htaccess` alone) regenerates the
`rewrite_rules` option against the **local** install. A DB import never
reconciles those rules: managed hosts (WP Engine, Kinsta) resolve pretty
permalinks at the web-server layer and often ship an empty or foreign
`rewrite_rules`, and the dump carries staging's rules, not the ones this
project's local code registers. Skipping the flush leaves a site that looks
fine in the browser — WordPress lazily rebuilds rules on the first front-end
request — but silently breaks permalink resolution in WP-CLI, cron, REST, and
wp-admin (e.g. `url_to_postid()` returns 0, custom CPT/taxonomy/endpoint rules
don't resolve). The flush is cheap (~1s) and harmless where unneeded, so it
runs unconditionally.

- Neutralize Jetpack's Site Accelerator (Asset CDN / Photon). Idempotent and
  safe — no-ops when Jetpack is inactive or the modules are already off:

  ```bash
  if npx wp-env run cli wp plugin is-active jetpack >/dev/null 2>&1; then
    npx wp-env run cli wp jetpack module deactivate photon-cdn 2>/dev/null || true
    npx wp-env run cli wp jetpack module deactivate photon 2>/dev/null || true
  fi
  ```

  Jetpack's Site Accelerator serves static JS/CSS (`photon-cdn`) and images
  (`photon`) from WordPress.com's CDN (`c0.wp.com`). That setting rides along in
  the staging DB, so after the import the local block editor starts pulling
  `wp-includes` JS from the CDN — at a core version that won't match the wp-env
  install. The mismatched `@wordpress/data` bundle recurses infinitely and the
  editor dies with `RangeError: Maximum call stack size exceeded`, making every
  post uneditable. On staging it's harmless (versions match); locally it must be
  off. Deactivating the modules (not all of Jetpack) is the minimal fix and
  leaves the rest of Jetpack's local behavior untouched.

- Reset the admin password. List admins first — **never** assume a username like `admin`:

  ```bash
  npx wp-env run cli wp user list --role=administrator \
    --fields=ID,user_login,user_email --format=table
  npx wp-env run cli wp user update <ID> --user_pass=password --skip-email
  ```

- Verify: `npm run wp:cli -- option get siteurl` should return `LOCAL_URL`.
- If a Caddy domain is enabled, also verify `curl -k -I -L --max-redirs 1 "https://<hostname>/wp-admin/"` ends on `https://<hostname>/wp-login.php...`, **not** `https://<hostname>:8888/...`.

If the staging host has no `wp-cli` on `$PATH`, **stop** rather than silently falling back — surface the error and the user can decide whether to install wp-cli on the server or pull a manual `mysqldump`. Don't invent a fallback in this flow.

#### Phase 6 — Configure uploads fallback to staging

The DB import rewrote every `https://<staging>/wp-content/uploads/...` URL to `https://<local>/wp-content/uploads/...`, but the uploads tree itself wasn't pulled (it's usually 10–50GB on a mature multisite). So every image on the rendered local site would 404 until you also rsync uploads.

The simpler pattern: serve uploads from staging on demand. A local-only mu-plugin filters attachment URLs, rewrites `/wp-content/uploads/` to staging for any path the local container doesn't have on disk, and sends a 302 for direct asset hits. Local-only files (anything you upload through the local admin) keep their local URL via a `file_exists()` short-circuit.

Idempotent. Skip silently if `apps/wordpress/wp-content/mu-plugins/02-wp-env-uploads-fallback.php` already exists *and* `.wp-env.override.json` already has `WP_ENV_UPLOADS_FALLBACK_URL` set.

1. Resolve the upstream origin:
   - Prefer `.refact-os.json` › `stack.wordpress.environments.staging.url`. Strip any path; keep `scheme://host` only.
   - If staging URL isn't set, ask the user — and don't write the constant; the mu-plugin no-ops when the constant is missing.

2. Add `WP_ENV_UPLOADS_FALLBACK_URL` to `.wp-env.override.json` (gitignored, **never** `.wp-env.json` — value varies per environment and per developer):

   ```json
   {
     "config": {
       "WP_ENV_UPLOADS_FALLBACK_URL": "https://<staging-host>"
     }
   }
   ```

   Merge with any existing keys; don't overwrite.

3. Write `apps/wordpress/wp-content/mu-plugins/02-wp-env-uploads-fallback.php` with this exact body (project-agnostic — reads `WP_HOME`/`WP_SITEURL` and the constant at runtime):

   ```php
   <?php
   /**
    * wp-env uploads fallback (local-only, generic).
    *
    * After /refact wp-env pull db, all media URLs in the DB point at the
    * local origin (e.g. https://ksom.local) but the uploads/ tree wasn't
    * synced — so /wp-content/uploads/... 404s. This mu-plugin transparently
    * rewrites such URLs back to a configured upstream (typically staging)
    * when the file doesn't exist locally, so local pages render with their
    * upstream media without rsyncing potentially-huge uploads trees.
    *
    * Reads:
    *   - WP_HOME (or WP_SITEURL)        - local origin (set by wp-env)
    *   - WP_ENV_UPLOADS_FALLBACK_URL    - upstream origin (no trailing slash)
    *
    * Matching is host-based so it survives port mangling: wp-env appends
    * :8888 to WP_HOME, but the URL rewriter (00-wp-env-local-url.php) strips
    * that port from emitted URLs. This file treats any URL whose host matches
    * the local host — with or without a port — as a candidate.
    *
    * No-op if either constant is missing, if local and upstream are equal,
    * or if WP_ENVIRONMENT_TYPE isn't `local`. Gitignored via the root
    * .gitignore wildcard (`**\/wp-content/mu-plugins/0[0-9]-wp-env-*.php`).
    */

   if ( ! ( defined( 'WP_ENVIRONMENT_TYPE' ) && 'local' === WP_ENVIRONMENT_TYPE ) ) {
   	return;
   }

   if ( ! defined( 'WP_ENV_UPLOADS_FALLBACK_URL' ) || '' === WP_ENV_UPLOADS_FALLBACK_URL ) {
   	return;
   }

   $wp_env_uploads_local_raw = '';
   if ( defined( 'WP_HOME' ) && WP_HOME ) {
   	$wp_env_uploads_local_raw = WP_HOME;
   } elseif ( defined( 'WP_SITEURL' ) && WP_SITEURL ) {
   	$wp_env_uploads_local_raw = WP_SITEURL;
   }

   $wp_env_uploads_local_parts  = parse_url( $wp_env_uploads_local_raw );
   $wp_env_uploads_remote_parts = parse_url( WP_ENV_UPLOADS_FALLBACK_URL );

   if ( empty( $wp_env_uploads_local_parts['host'] ) || empty( $wp_env_uploads_remote_parts['host'] ) ) {
   	return;
   }

   $wp_env_uploads_local_host  = strtolower( $wp_env_uploads_local_parts['host'] );
   $wp_env_uploads_remote_host = strtolower( $wp_env_uploads_remote_parts['host'] );

   if ( $wp_env_uploads_local_host === $wp_env_uploads_remote_host ) {
   	return;
   }

   $wp_env_uploads_path   = '/wp-content/uploads/';
   $wp_env_uploads_target = untrailingslashit( WP_ENV_UPLOADS_FALLBACK_URL ) . $wp_env_uploads_path;
   $wp_env_uploads_dir    = rtrim( WP_CONTENT_DIR, '/' ) . '/uploads/';

   $wp_env_uploads_rewrite = static function ( $url ) use ( $wp_env_uploads_local_host, $wp_env_uploads_target, $wp_env_uploads_path, $wp_env_uploads_dir ) {
   	if ( ! is_string( $url ) || '' === $url ) {
   		return $url;
   	}
   	if ( false === strpos( $url, $wp_env_uploads_path ) ) {
   		return $url;
   	}
   	$parts = parse_url( $url );
   	if ( empty( $parts['host'] ) || strtolower( $parts['host'] ) !== $wp_env_uploads_local_host ) {
   		return $url;
   	}
   	if ( empty( $parts['path'] ) ) {
   		return $url;
   	}
   	$pos = strpos( $parts['path'], $wp_env_uploads_path );
   	if ( false === $pos ) {
   		return $url;
   	}
   	$relative = substr( $parts['path'], $pos + strlen( $wp_env_uploads_path ) );
   	if ( '' !== $relative && file_exists( $wp_env_uploads_dir . $relative ) ) {
   		return $url;
   	}
   	$query    = isset( $parts['query'] ) ? '?' . $parts['query'] : '';
   	$fragment = isset( $parts['fragment'] ) ? '#' . $parts['fragment'] : '';
   	return $wp_env_uploads_target . $relative . $query . $fragment;
   };

   // Direct hits to /wp-content/uploads/<missing-file> → 302 to upstream.
   // Priority -100 runs before any output buffer wraps the response.
   add_action( 'template_redirect', static function () use ( $wp_env_uploads_target, $wp_env_uploads_path, $wp_env_uploads_dir ) {
   	if ( ! is_404() ) {
   		return;
   	}
   	$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? $_SERVER['REQUEST_URI'] : '';
   	$pos         = strpos( $request_uri, $wp_env_uploads_path );
   	if ( false === $pos ) {
   		return;
   	}
   	$relative      = substr( $request_uri, $pos + strlen( $wp_env_uploads_path ) );
   	$relative_path = preg_replace( '/[?#].*$/', '', $relative );
   	if ( '' === $relative_path || file_exists( $wp_env_uploads_dir . $relative_path ) ) {
   		return;
   	}
   	header( 'Location: ' . $wp_env_uploads_target . $relative, true, 302 );
   	exit;
   }, -100 );

   add_filter( 'wp_get_attachment_url', $wp_env_uploads_rewrite, PHP_INT_MAX );

   add_filter( 'wp_get_attachment_image_src', static function ( $image ) use ( $wp_env_uploads_rewrite ) {
   	if ( is_array( $image ) && isset( $image[0] ) ) {
   		$image[0] = $wp_env_uploads_rewrite( $image[0] );
   	}
   	return $image;
   }, PHP_INT_MAX );

   add_filter( 'wp_calculate_image_srcset', static function ( $sources ) use ( $wp_env_uploads_rewrite ) {
   	if ( is_array( $sources ) ) {
   		foreach ( $sources as $key => $source ) {
   			if ( isset( $source['url'] ) ) {
   				$sources[ $key ]['url'] = $wp_env_uploads_rewrite( $source['url'] );
   			}
   		}
   	}
   	return $sources;
   }, PHP_INT_MAX );

   // Block-editor/theme markup often hardcodes <img src="https://<local>/wp-content/uploads/...">
   // strings that bypass the attachment filters. Wrap response output in a buffer and rewrite
   // any local-origin uploads URL whose file is missing locally. Priority 1 nests this buffer
   // inside the URL-rewriter buffer from 00-wp-env-local-url.php; that file's shutdown handler
   // flushes both.
   add_action( 'template_redirect', static function () use ( $wp_env_uploads_local_host, $wp_env_uploads_target, $wp_env_uploads_path, $wp_env_uploads_dir ) {
   	ob_start( static function ( $html ) use ( $wp_env_uploads_local_host, $wp_env_uploads_target, $wp_env_uploads_path, $wp_env_uploads_dir ) {
   		$pattern = '#https?://' . preg_quote( $wp_env_uploads_local_host, '#' ) . '(?::\d+)?' . preg_quote( $wp_env_uploads_path, '#' ) . '([^\s"\'<>)]+)#i';
   		return preg_replace_callback( $pattern, static function ( $matches ) use ( $wp_env_uploads_target, $wp_env_uploads_dir ) {
   			$relative      = $matches[1];
   			$relative_path = preg_replace( '/[?#].*$/', '', $relative );
   			if ( '' !== $relative_path && file_exists( $wp_env_uploads_dir . $relative_path ) ) {
   				return $matches[0];
   			}
   			return $wp_env_uploads_target . $relative;
   		}, $html );
   	} );
   }, 1 );
   ```

4. Ensure the root `.gitignore` contains a wildcard for these local-only mu-plugins (write only if missing):

   ```
   # Per-developer wp-env mu-plugins (00..09 are reserved for local-only
   # helpers written by the wp-env skill — URL rewriter, local-config bridge,
   # uploads fallback, etc.). Never deploy.
   **/wp-content/mu-plugins/0[0-9]-wp-env-*.php
   ```

5. Restart wp-env so it picks up the new constant from `.wp-env.override.json`:

   ```bash
   npx wp-env start
   ```

6. Verify (replace `<local-host>` and `<staging-host>`):

   ```bash
   # Constant is exposed to PHP:
   npx wp-env run cli wp eval "echo defined('WP_ENV_UPLOADS_FALLBACK_URL') ? WP_ENV_UPLOADS_FALLBACK_URL : 'undef';" --url=<LOCAL_URL>

   # Direct hit on a missing upload returns 302 → staging:
   curl -k -sI --resolve "<local-host>:443:127.0.0.1" \
     "https://<local-host>/wp-content/uploads/<known-staging-path>" \
     | grep -E "^(HTTP|location)"

   # Rendered HTML has no local-origin uploads URLs (or only ones that exist on disk):
   curl -k -sS --resolve "<local-host>:443:127.0.0.1" "https://<local-host>/" \
     | grep -oE "https?://<local-host>/wp-content/uploads/[^\"]+" \
     | head -5
   ```

7. Report. Surface that local-only uploads (anything added through the local admin) are kept local via the `file_exists()` short-circuit, and that the `--delete` flag on the next `pull mu-plugins` won't touch this file thanks to the `0[0-9]-wp-env-*.php` exclude filter.

**Guardrails:**

- Never put `WP_ENV_UPLOADS_FALLBACK_URL` in `.wp-env.json`. Each developer may set a different upstream (some use a sanitized media CDN, others use staging directly).
- Never write the mu-plugin into the staging codebase. The `0[0-9]-wp-env-*.php` exclude filter must be present in `pull mu-plugins`.
- Don't enable this without `WP_ENVIRONMENT_TYPE=local`. The mu-plugin guards itself, but treat that guard as a belt-and-braces, not a license to ship it.

### 2e. Pull `wp-config`

Reads the staging `wp-config.php` via SSH and extracts application-level constants into the local environment. Run this after `pull db` so the local stack has the same constants the staging code expects.

```bash
ssh ${SSH_OPTS} "${SSH_TARGET}" "cat '${DOC_ROOT}/wp-config.php'"
```

Classify each `define()` in the file into one of four buckets:

**Skip (infrastructure — handled by wp-env or the host):**

- Database: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_HOST_SLAVE`, `DB_CHARSET`, `DB_COLLATE`, `$table_prefix`
- Salts/keys: `AUTH_KEY`, `SECURE_AUTH_KEY`, `LOGGED_IN_KEY`, `NONCE_KEY`, `AUTH_SALT`, `SECURE_AUTH_SALT`, `LOGGED_IN_SALT`, `NONCE_SALT`
- WordPress core paths: `ABSPATH`, `WP_CACHE`, `WPLANG`, `WP_AUTO_UPDATE_CORE`
- Host-injected (read `hosting` from `.refact-os.json` › `stack.wordpress.hosting`):
  - **WP Engine**: `WPE_*`, `PWP_NAME`, `FS_METHOD`, `FS_CHMOD_*`, `WPE_SFTP_*`, `WPE_CDN_*`, `DISALLOW_FILE_*`, `DISABLE_WP_CRON`, `FORCE_SSL_LOGIN`, `WPE_FORCE_SSL_LOGIN`, `WP_POST_REVISIONS`, `WP_TURN_OFF_ADMIN_BAR`, `WPE_BETA_TESTER`, `WPE_WHITELABEL`, `WPE_EXTERNAL_URL`, `$wpe_*`, `$memcached_servers`
  - **Kinsta**: `KINSTA_*`, `WP_CACHE_KEY_SALT`
- Debug flags: `WP_DEBUG`, `WP_DEBUG_LOG`, `WP_DEBUG_DISPLAY` (already set in `.wp-env.json`)

**Scalar, non-secret → `.wp-env.json` `config` (committed):**

Application constants with no secret value: version strings, import/feature IDs, memory limits, email addresses. Examples: `SLM_CORE_VERSION`, `CONTENT_IMPORT_ID`, `WP_MEMORY_LIMIT`, `WP_MAX_MEMORY_LIMIT`.

Add these to the existing `config` object in `.wp-env.json`. Don't overwrite values already present.

**Scalar, secret → `.wp-env.override.json` `config` (gitignored):**

API keys, encryption keys, tokens. Examples: `SLM_AKISMET_API_KEY`, `WP2FA_ENCRYPT_KEY`.

Create `.wp-env.override.json` if it doesn't exist (`{ "config": { … } }`). This file must be in the root `.gitignore`.

**Complex (PHP arrays) → local mu-plugin (gitignored):**

wp-env `config` only supports scalar values. PHP arrays (e.g. service-account credential blobs) go into `apps/wordpress/wp-content/mu-plugins/01-wp-env-local-config.php`, guarded by:

```php
if ( defined( 'WP_ENVIRONMENT_TYPE' ) && 'local' === WP_ENVIRONMENT_TYPE ) {
    if ( ! defined( 'SOME_CONSTANT' ) ) {
        define( 'SOME_CONSTANT', array( … ) );
    }
}
```

This file must be in `apps/wordpress/.gitignore`.

**After writing all files:**

1. Restart wp-env: `npx wp-env start` (picks up `.wp-env.json` and override changes).
2. Verify: `npx wp-env run cli wp eval "echo defined('CONSTANT_NAME') ? 'yes' : 'no';"` for a sample of the extracted constants.
3. If a previously-crashed plugin depended on a missing constant (common: GA4/analytics credentials), re-activate it: `npx wp-env run cli wp plugin activate <plugin-slug>`.

**Guardrails:**

- Never commit secrets. `.wp-env.override.json` and `01-wp-env-local-config.php` must always be gitignored.
- Never copy the staging DB credentials, salts, or host-specific constants into local files — they're meaningless locally and risk leaking if committed.
- Show the user the proposed classification (which constants go where) before writing, so they can override the bucket for edge cases.

---

## Step 3 — `domain set <hostname>` / `domain clear`

Front the wp-env stack with a Caddy reverse proxy so the local site answers on `https://<hostname>` instead of `http://localhost:8888`. The hostname is stored in `.refact-os.json` › `wpEnv.localDomain`, the proxy config lives in `~/.refact/`, and `/etc/hosts` maps the name to `127.0.0.1`.

### 3a. Preflight

- `caddy` is on `$PATH`. If missing, stop and tell the user to install it (macOS: `brew install caddy`; Linux: see [caddyserver.com/docs/install](https://caddyserver.com/docs/install)).
- The hostname ends in `.local`, `.test`, or `.localhost`. Refuse public-looking suffixes (`.com`, `.io`, etc.) — Caddy would try to reach Let's Encrypt and fail, and the user almost certainly meant a local-only name. If they really want a registered TLD, surface the risk and ask again.
- The hostname is lowercase, kebab-case ASCII (`^[a-z0-9][a-z0-9-]*\.(local|test|localhost)$`).
- wp-env is running (`docker ps | grep -q wordpress`). If not, run `npx wp-env start` first — Caddy needs the upstream up.

### 3b. `domain set <hostname>`

1. Persist the domain:

   ```jsonc
   // .refact-os.json
   {
     "stack": {
       "wordpress": { "hosting": null, "runtime": null, "environments": {} }
     },
     "wpEnv": {
       "localDomain": "<hostname>"
     }
   }
   ```

   Read, merge, write back via the same JSON the rest of `/refact` uses — don't hand-edit other keys.

1b. Assign a unique port.

   - If `.refact-os.json` › `wpEnv.port` is already set, use that value as `<port>` — the project's port is canonical and must not change on re-runs.
   - Otherwise: scan `~/.refact/caddy/*.caddyfile` for all `reverse_proxy 127.0.0.1:<N>` lines, collect the port numbers in use, then pick the **lowest free integer ≥ 8888**.

     ```bash
     grep -rh 'reverse_proxy 127\.0\.0\.1:' ~/.refact/caddy/*.caddyfile 2>/dev/null \
       | grep -oE '[0-9]{4,5}$' | sort -n
     ```

     Walk `8888, 8889, 8890, …` until you find one not in that list.

   - Persist the chosen port to `.refact-os.json` › `wpEnv.port` (merge; do not overwrite other keys).
   - Add (or update) `"port": <port>` as a top-level key in `.wp-env.json` (committed — this is the canonical binding so every teammate inherits the same port).
   - Restart wp-env so the new port binding takes effect before Caddy is configured:

     ```bash
     npx wp-env stop
     npx wp-env start
     ```

2. Ensure the global Caddy scaffold exists:

   ```bash
   mkdir -p ~/.refact/caddy
   ```

   Write `~/.refact/Caddyfile` (only if missing):

   ```caddyfile
   # Managed by /refact wp-env. Per-project site blocks live in ~/.refact/caddy/.
   {
     # global options
   }
   import caddy/*.caddyfile
   ```

3. Write the per-project site block at `~/.refact/caddy/<project-slug>.caddyfile`. `<project-slug>` is `basename` of the project root, lowercased, with non-alphanumerics replaced by `-`:

   ```caddyfile
   <hostname> {
     reverse_proxy 127.0.0.1:<port> {
       # wp-env may emit redirects to its internal port. Keep browser traffic on Caddy's HTTPS origin.
       header_down Location "https://<hostname>:<port>/" "https://<hostname>/"
       header_down Location "https://localhost:<port>/" "https://<hostname>/"
       header_down Location "http://localhost:<port>/" "https://<hostname>/"
     }
   }
   ```

   `<port>` is the value assigned in step 1b. If the file already exists for this slug, overwrite it — this verb is the source of truth for the project's site block.

4. Trust the Caddy local CA (idempotent — silently noops if already trusted):

   ```bash
   caddy trust
   ```

   On macOS this prompts for a sudo password the first time so it can add the root cert to the system keychain. Surface the prompt to the user; do not bypass.

5. Add the `/etc/hosts` entry. This requires `sudo`. Don't run `sudo` directly from the flow — print the exact command and ask the user to run it themselves:

   ```bash
   # The user runs this:
   echo "127.0.0.1 <hostname>" | sudo tee -a /etc/hosts
   ```

   Before printing, check whether the entry already exists (`grep -E "^127\.0\.0\.1[[:space:]]+<hostname>$" /etc/hosts`). If it's there, skip this step silently.

6. Start or reload Caddy:

   ```bash
   # If not already running:
   caddy start --config ~/.refact/Caddyfile --adapter caddyfile

   # If already running:
   caddy reload --config ~/.refact/Caddyfile --adapter caddyfile
   ```

   Detect "already running" with `pgrep -x caddy` or `caddy list-modules` exit status. Don't try both — pick one and stick with it.

7. Set `WP_HOME` and `WP_SITEURL` in `.wp-env.override.json` (gitignored, **not** `.wp-env.json`):

   ```json
   {
     "config": {
       "WP_HOME": "https://<hostname>",
       "WP_SITEURL": "https://<hostname>"
     }
   }
   ```

   wp-env will append `:8888` to these (e.g. `https://<hostname>:8888`), but the mu-plugin's `str_replace` and output buffer strip the port. This ensures plugins that read PHP constants directly (common with Visual Composer, Max Mega Menu, and page builders) get the correct hostname instead of `localhost`. Without this, those plugins emit `https://localhost:8888` asset URLs that fail with `ERR_SSL_PROTOCOL_ERROR` when the browser is on the Caddy HTTPS origin.

   After writing the override, restart the stack:

   ```bash
   npx wp-env stop
   npx wp-env start
   ```

   If the DB already has the old URL baked in (it usually does — WP stores `siteurl` and `home` in `wp_options`), run a one-shot search-replace:

   ```bash
   npx wp-env run cli wp search-replace "http://localhost:8888" "https://<hostname>" \
     --skip-columns=guid --all-tables
   npx wp-env run cli wp cache flush
   ```

   Confirm the source/target URLs with the user before running.

8. Write a local-only mu-plugin at `apps/wordpress/wp-content/mu-plugins/00-wp-env-local-url.php` (substitute both `<hostname>` and `<port>`). This file is intentionally ignored by `apps/wordpress/.gitignore`; do not add a gitignore exception for it.

   ```php
   <?php
   /**
    * Local wp-env URL overrides.
    *
    * This file is ignored by git via apps/wordpress/.gitignore and should not be
    * deployed. It keeps browser-facing URLs on the Caddy HTTPS origin instead of
    * wp-env's internal :<port> port.
    */

   if ( defined( 'WP_ENVIRONMENT_TYPE' ) && 'local' === WP_ENVIRONMENT_TYPE ) {
       $local_url = 'https://<hostname>';

       $rewrite_local_url = static function ( $url ) use ( $local_url ) {
           if ( ! is_string( $url ) ) {
               return $url;
           }

           return str_replace(
               array(
                   'https://<hostname>:<port>',
                   'http://<hostname>:<port>',
                   'https://localhost:<port>',
                   'http://localhost:<port>',
               ),
               $local_url,
               $url
           );
       };

       add_filter( 'option_home', static fn () => $local_url, PHP_INT_MAX );
       add_filter( 'option_siteurl', static fn () => $local_url, PHP_INT_MAX );

       foreach ( array( 'home_url', 'site_url', 'admin_url', 'includes_url', 'content_url', 'plugins_url', 'network_site_url' ) as $url_filter ) {
           add_filter( $url_filter, $rewrite_local_url, PHP_INT_MAX );
       }

       // Catch enqueued script/style sources and upload URLs.
       add_filter( 'script_loader_src', $rewrite_local_url, PHP_INT_MAX );
       add_filter( 'style_loader_src', $rewrite_local_url, PHP_INT_MAX );
       add_filter( 'wp_get_attachment_url', $rewrite_local_url, PHP_INT_MAX );
       add_filter( 'upload_dir', static function ( $dirs ) use ( $rewrite_local_url ) {
           $dirs['url']     = $rewrite_local_url( $dirs['url'] );
           $dirs['baseurl'] = $rewrite_local_url( $dirs['baseurl'] );
           return $dirs;
       }, PHP_INT_MAX );

       // Output buffer as a final safety net — rewrites any stray :<port> or
       // localhost URLs that plugins inject outside the WordPress filter chain.
       add_action( 'template_redirect', static function () use ( $rewrite_local_url ) {
           ob_start( static function ( $html ) use ( $rewrite_local_url ) {
               return $rewrite_local_url( $html );
           });
       }, 0 );

       add_action( 'shutdown', static function () {
           while ( ob_get_level() > 0 ) {
               ob_end_flush();
           }
       }, PHP_INT_MAX );
   }
   ```

9. Verify the browser-facing URLs:

   ```bash
   npx wp-env run cli wp cache flush
   npm run wp:cli -- option get home
   npm run wp:cli -- option get siteurl
   curl -k -I -L --max-redirs 1 "https://<hostname>/wp-admin/"
   if curl -k -sS "https://<hostname>/wp-login.php" | grep ':<port>'; then
     echo "unexpected :<port> URL"
   fi
   ```

   Expected: `home` and `siteurl` print `https://<hostname>`, `/wp-admin/` redirects to `https://<hostname>/wp-login.php?...`, and the login page contains no `:<port>` asset/form URLs. If the browser shows `SSL_ERROR_RX_RECORD_TOO_LONG`, it is almost certainly following an HTTPS URL on `:<port>`; inspect the `Location` header and login markup.

10. Report:

   - Site URL: `https://<hostname>`
   - Admin URL: `https://<hostname>/wp-admin`
   - wp-env port: `<port>` (unique to this project; stored in `.refact-os.json` › `wpEnv.port` and `.wp-env.json`)
   - Caddyfile: `~/.refact/caddy/<project-slug>.caddyfile`
   - Local URL helper: `apps/wordpress/wp-content/mu-plugins/00-wp-env-local-url.php` (gitignored)
   - That domain and port are persisted in `.refact-os.json` so other teammates pick them up on their next `/refact wp-env setup`.

### 3c. `domain clear`

1. Remove `wpEnv.localDomain` and `wpEnv.port` from `.refact-os.json` (delete both keys; if `wpEnv` becomes empty, remove that too).
2. Remove the `"port"` key from `.wp-env.json` so wp-env reverts to its default `8888` binding.
3. Delete `~/.refact/caddy/<project-slug>.caddyfile`. If the directory is now empty, leave the directory in place — another project may need it.
4. Delete `apps/wordpress/wp-content/mu-plugins/00-wp-env-local-url.php` if it exists.
5. Reload Caddy if it's running (`caddy reload …`). Don't stop the global Caddy process — other projects may rely on it.
6. Tell the user the `/etc/hosts` entry was **not** removed automatically (it's harmless and removing it would need another sudo prompt). Print the exact `sudo sed -i ''` command they can run if they want it gone.
7. Keep `.wp-env.json` and `.wp-env.override.json` free of `WP_HOME` / `WP_SITEURL`, restart wp-env, then run a search-replace from `https://<old-hostname>` back to `http://localhost:8888` so the DB matches.

### 3d. Multi-project caveat

Caddy binds `:80` and `:443`, so only one Caddy process can run per machine. The `~/.refact/Caddyfile` `import` pattern handles this: each project owns its own site block under `~/.refact/caddy/`, and the single running Caddy serves all of them. **Don't** scaffold a project-local Caddyfile inside the repo — it would either bind-collide or get accidentally committed.

Because each project gets a unique port assigned in step 1b, **multiple wp-env stacks can run simultaneously** — Caddy routes `site-a.local` → `127.0.0.1:8888`, `site-b.local` → `127.0.0.1:8889`, etc. Each project's Docker container listens on its own port, so visiting one domain never proxies to another project's container.

If two projects pick the same hostname, the second `domain set` would overwrite the first project's Caddyfile. Before writing in step 3, check: if `~/.refact/caddy/<project-slug>.caddyfile` already exists and its `reverse_proxy` upstream port differs from the current project's `wpEnv.port`, ask the user to confirm before overwriting.

**Migrating an existing project** (one that ran `domain set` before this port-assignment logic was added): simply re-run `/refact wp-env domain set <existing-hostname>`. The skill detects `wpEnv.port` is absent, assigns a unique port, writes it to `.wp-env.json` and `.refact-os.json`, rewrites the Caddyfile and mu-plugin, and restarts wp-env. Migrate one project at a time so each gets a distinct port.

## Step 4 — `reset`

```bash
npx wp-env destroy
npx wp-env start
```

`destroy` removes the MySQL volume; the next `start` rebuilds with the wp-env default sample install. **Local DB changes are lost** — confirm with the user before running. Files under `apps/wordpress/wp-content/` are not touched (they live on the host, not in the volume).

After the stack is back up, re-activate the `disable-emails` plugin (the plugin files survive the reset because they live on the host, but `destroy` wipes the DB so WordPress forgets it was active):

```bash
npx wp-env run cli wp plugin activate disable-emails
```

Unless `.refact-os.json` › `wpEnv.withTests` is `true`, stop the tests containers after the fresh `start` (same as Step 1e default behavior).

After reset, the user typically wants `/refact wp-env pull db` to restore staging state.

---

## Guardrails

- **`apps/wordpress/wp-content/` is the source of truth.** Never write to `./wp-content/` at the repo root — that's the legacy layout. If you find both, ask the user which one is current before any pull.
- **Never pull from production.** The flow is staging-only. If the user explicitly insists on prod, stop and require explicit owner approval.
- **Never run `search-replace` without confirming the URLs.** A bad replace can rewrite half the DB to the wrong host and is painful to undo. Always print the source and target URL once before executing.
- **Never `wp-env destroy` without confirmation.** It nukes the local DB. `reset` confirms; ad-hoc destroy elsewhere should too.
- **Never invent a fallback** when staging's wp-cli or rsync isn't available. Surface the error, let the user decide.
- **Never edit other files to fill missing SSH fields from this flow.** Ask the user to fill `.refact-os.json` › `stack.wordpress.environments.<env>.ssh` — that's the single source of truth.
- **Never commit pulled DB dumps.** If you write a `.sql` file at any point during this flow, place it in a gitignored path (e.g. `./.wp-env-dumps/`) and delete it after import.
- **Never write Caddyfiles into the project tree.** Per-project site blocks live under `~/.refact/caddy/`. Project-local files would either bind-collide with another project's Caddy instance or end up committed by accident.
- **Never accept a public-TLD hostname** for `domain set` (`.com`, `.io`, etc.) without explicit user confirmation — Caddy would try Let's Encrypt and either fail or, worse, attempt ACME against a domain the user doesn't control.
- **Never run `sudo` from this flow.** `/etc/hosts` edits and `caddy trust` print the command for the user to run; they keep the credential prompt in their own hands.

## When to stop and ask the user

- `git status` shows large, unexpected diffs after `pull plugins` (e.g. an entire vendored plugin you didn't know was there) → surface before staging the changes.
- The staging URL from `.refact-os.json` doesn't match the user's stated staging URL → resolve before running `search-replace`.
- A pull would `--delete` a local-only plugin that looks like work-in-progress (no matching commit history) → ask first.
- The user asks to point this flow at a different remote (e.g. "pull from dev instead") → that's an architectural change; confirm whether to add a `dev` environment under `.refact-os.json` › `stack.wordpress.environments` or treat it as a one-off prompt.
