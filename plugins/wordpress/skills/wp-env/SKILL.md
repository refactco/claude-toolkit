---
name: wp-env
description: Manage the local WordPress stack via wp-env — setup, pull plugins/mu-plugins/db from staging, reset, and Caddy local domain with automated hosts/cert/mount setup.
pattern: procedure
when_to_use: /refact wp-env setup [--with-tests] | pull [plugins|mu-plugins|db|wp-config] | reset | domain set <host> | domain clear; local WordPress dev, ksom.local/*.local unreachable, cert/SSH/hosts/virtiofs mount errors.
when_not_to_use: Non-WordPress projects.
next_skills: []
sub_agents: []
---

# wp-env Reference

Local code lives under the WordPress app dir (folder with `wp-content/`; monorepo default `apps/wordpress/` — substitute your detected path). Config in `.refact-os.json` › `stack.wordpress` and `wpEnv`. Pull sources: `…environments.staging`.

**Never** create a root `./wp-content/` — it splits the source of truth and breaks the deploy filter.

## Helper scripts (do the fragile scanning/parsing — call these, never inline the logic)

- `scripts/host-setup.sh <hostname>` — idempotent local-domain wiring. Ensures `/etc/hosts` maps `<hostname>→127.0.0.1` (self-elevates via one `sudo` prompt, skips if present), runs `caddy trust` (skips if CA already trusted), writes `~/.refact/caddy/<slug>.caddyfile` + global `~/.refact/Caddyfile`, and `caddy start|reload`. Exit 0 = ready; exit 2 = user declined sudo (print the exact `echo … | sudo tee -a /etc/hosts` line and stop).
- `scripts/host-verify.sh <hostname> <port>` — verifies reachability. Uses `curl --resolve "<hostname>:443:127.0.0.1"` **only** on curl ≥7.21 (checks `curl --version`); otherwise relies on the real `/etc/hosts` entry with plain `curl -k -I`. Never emits a bare `--resolve` on an unsupported curl. Prints `OK` or the failing redirect chain; asserts no `:<port>` leaks in login markup.
- `scripts/ssh-check.sh <env>` — reads `…environments.<env>.ssh`, corrects WP Engine `port:2222`→`22`, validates the key file is a real public key before use (`ssh-keygen -l -f`), then `test -d $DOC_ROOT/wp-content`. Exit non-zero with the missing field named.
- `scripts/port-pick.sh` — scans `~/.refact/caddy/*.caddyfile` for used `reverse_proxy 127.0.0.1:<N>` ports, prints lowest free ≥8888.

## Preflight (always)
`stack.wordpress` exists · app dir found · `docker info` exits 0 · Node ≥18. For `pull`: run `scripts/ssh-check.sh staging`.

## setup [--with-tests]
Idempotent; verify each sub-step, skip silently if met.
1. `mkdir -p <app>/wp-content/{plugins,themes,mu-plugins}`.
2. Write `.wp-env.json` if absent: `$schema`, `core:null`, `phpVersion:"8.2"`, `mappings` for the three dirs from `./<app>/wp-content/*`, `config` `{WP_DEBUG,WP_DEBUG_LOG,WP_DEBUG_DISPLAY:false,SCRIPT_DEBUG,WP_ENVIRONMENT_TYPE:"local"}`. Add top-level `"port"` if `wpEnv.port` set. If it maps from legacy `./wp-content/*`, show diff and ask before rewriting. Keep `WP_HOME`/`WP_SITEURL` **out** of `.wp-env.json`.
3. **Debug log via directory mount** (virtiofs breaks single-file bind mounts): map a directory `"wp-content/wp-env-logs":"./<app>/wp-content/wp-env-logs"` and set `WP_DEBUG_LOG` to the absolute in-container path `"/var/www/html/wp-content/wp-env-logs/debug.log"`. Never bind-mount a single file (`debug.log`, `.user.ini`) — Docker containerd/virtiofs makes those unreliable.
4. `npm i -D @wordpress/env` if missing; add missing `wp:*` scripts (`start/stop/destroy/clean/logs/cli/shell`).
5. `npx wp-env start`. Unless `--with-tests`/`wpEnv.withTests:true`, stop the tests containers; offer to remove tests images.
6. Install+activate `disable-emails` (idempotent).
7. Post-start checklist (each independent, one y/n, skip if met): pull plugins+mu-plugins → pull db → `domain set` → uploads fallback. Print `[x]/[-]/[ ]` summary.

## pull  (`pull` = plugins→mu-plugins→db)
Preflight via `scripts/ssh-check.sh`. Read `SSH_USER/HOST/PORT`, `DOC_ROOT`, `STAGING_URL`. **Staging only — refuse production.**
- **plugins**: `rsync -avz --delete -e "ssh -p $PORT" --exclude=index.php --exclude='disable-emails/' $TARGET:$DOC_ROOT/wp-content/plugins/ <app>/wp-content/plugins/`. Warn once before `--delete`.
- **mu-plugins**: same, plus `--filter='- 0[0-9]-wp-env-*.php'` (reserved local-only helpers) and host-specific excludes (kinsta-mu-plugins; WP Engine `mu-plugin.php`, `wpe-*`, `wpengine-*`, force-strong-passwords).
- **db**: stack must be running. Read `table_prefix` on staging; export only real tables (`wp db export --tables=$(wp db tables --all-tables-with-prefix …)`) to `./.wp-env-dumps/`, `sed` non-standard prefix→`wp_`, `wp db reset --yes`, import, then `search-replace` **each** URL (staging, `*.wpenginepowered.com`, production)→`LOCAL_URL` (`--skip-columns=guid --all-tables`) — confirm each pair first. Flush rewrite+cache, deactivate Jetpack `photon`/`photon-cdn`, reset admin pass (list admins first), delete dumps. Then configure uploads fallback (mu-plugin `02-wp-env-uploads-fallback.php` + `WP_ENV_UPLOADS_FALLBACK_URL` in `.wp-env.override.json`).
- **wp-config**: read staging `wp-config.php`; classify `define()`s — skip DB/salts/core/host-injected; non-secret scalars→`.wp-env.json` config; secrets→`.wp-env.override.json`; PHP arrays→gitignored `01-wp-env-local-config.php`. Show classification before writing; restart.

## domain set <hostname>
Refuse non-`.local/.test/.localhost` suffixes. Steps:
1. Persist `wpEnv.localDomain`; `wpEnv.port` = existing or `scripts/port-pick.sh`; write `"port"` into `.wp-env.json`; `npx wp-env stop && start`.
2. Run `scripts/host-setup.sh <hostname>` — does hosts+cert+Caddyfile+reload with zero manual steps (honor its exit codes above).
3. `.wp-env.override.json` (gitignored): `WP_HOME`/`WP_SITEURL` = `https://<hostname>`; restart; `search-replace http://localhost:<port> → https://<hostname>` (confirm).
4. Write gitignored `00-wp-env-local-url.php` filtering `home_url/site_url/admin_url/…/script_loader_src/style_loader_src/upload_dir` and an output buffer to strip `:<port>`/localhost.
5. `scripts/host-verify.sh <hostname> <port>`; report URLs + port.

## domain clear
Remove `wpEnv.localDomain`/`port`; drop `"port"` from `.wp-env.json`; delete `~/.refact/caddy/<slug>.caddyfile`, `00-wp-env-local-url.php`; `caddy reload`; keep `/etc/hosts` (print removal command); strip `WP_HOME`/`WP_SITEURL`; restart; `search-replace` back to `http://localhost:8888`.

## reset
`npx wp-env destroy && start` (confirm — wipes local DB). Re-activate `disable-emails`; stop tests unless `withTests`. Suggest `pull db` next.

## Guardrails
`<app>/wp-content/` is the truth. Staging-only pulls. Never `search-replace`/`destroy` without confirming. Never `sudo` yourself outside `host-setup.sh` (which self-elevates with one visible prompt). Never single-file bind-mounts. Never commit dumps/secrets. Fill missing SSH fields only in `.refact-os.json`.
