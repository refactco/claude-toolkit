# Shared deploy rules — Kinsta & WP Engine auto-deploy

Shared by the `setup-kinsta-deploy` and `setup-wpengine-deploy` skills. Read this before
writing any workflow file. Below, `<wp-app-dir>` stands for the WordPress app directory in
the repo (the Kinsta skill writes it as `<WP_APP_DIR>`, the WP Engine skill as `<wp-app>`),
and "the host" is Kinsta or WP Engine. Host-specific details — branch names, git endpoints,
and exactly what gets pushed — live in each skill's "specifics for the shared rules" list.

## Vendor policy

**The default for these WordPress projects is: `vendor/` directories are tracked in git.** Each plugin (or mu-plugin) commits its `composer install` output alongside the source.

Consequences for the deploy flow:

- The deploy workflow **must not** run `composer install`. It ships exactly what git tracks — nothing is built in CI.
- The bytes deployed to the host equal the bytes in the merge commit — deploys are deterministic and there's no build step that can drift between environments.
- New plugin dependencies require a commit that includes the updated `vendor/` tree alongside the `composer.json` change.

Override path: a project that wants a build-in-CI flow must (a) add a `composer install --no-dev --optimize-autoloader` step in the workflow before the deploy tree is assembled (each host skill says exactly where), (b) add the matching `vendor/` ignore rules to the repo's `.gitignore`, and (c) document the deviation in `docs/decisions.md` (create it if missing) with a responsible person.

## `.gitignore` hard rules

The host receives **only** what's tracked by git under the WordPress app directory. That means the `.gitignore` files in the repo are the deploy filter, not just a local hygiene tool.

- **Never use a root-whitelist `.gitignore` pattern (`/*` followed by `!apps/`, `!docs/`, …)** at the repo root. Whitelists are fragile across branch switches: a branch that doesn't carve out one of the allowed paths can quietly drop tracking on files the deploy depends on. Use blocklist semantics (ignore specific things; track everything else).
- **Scoped allow-lists belong in `<wp-app-dir>/.gitignore`**, not at the repo root. That's where the classic "ignore WP core; allow `wp-content/`" pattern lives.
- **Never delete or aggressively rewrite `<wp-app-dir>/.gitignore`** — it's load-bearing. Without it, the deploy tree would pick up WordPress core files, dump files, or local dev artifacts.

## Smoke-testing the auto-deploy

Round-trip test that doesn't touch theme/plugin code:

1. On the host's lowest deploy branch (each skill names it), create `<wp-app-dir>/wp-content/mu-plugins/deploy-test.php`:

   ```php
   <?php
   /** Plugin Name: Deploy Test */
   defined('ABSPATH') || exit;
   add_action('wp_footer', function () {
       echo '<div style="position:fixed;bottom:8px;right:8px;background:#222;color:#fff;padding:6px 10px;font:12px monospace;z-index:99999;">deploy ok &middot; ' . esc_html(gmdate('c')) . '</div>';
   });
   ```

2. Add `!wp-content/mu-plugins/deploy-test.php` to `<wp-app-dir>/.gitignore`.
3. Commit and push that branch to GitHub.
4. Watch `https://github.com/<org>/<repo>/actions` → the matching deploy workflow run (each skill names it).
5. Visit that environment's URL — the bottom-right badge means the tree reached the host and was checked out.
6. Revert via a **new commit** (don't amend) — delete the file, remove the gitignore line, push.

## Hard rules

1. **Force-push (`--force`) is required for the host's git endpoint and only that endpoint.** The host's git endpoint can't fast-forward against a fresh-init tree. Never `--force` to `main`, `stage`, or any other GitHub branch.
2. **Never delete or aggressively rewrite `<wp-app-dir>/.gitignore`.** It is the deploy filter (see above).
3. **Never place workflows under `<wp-app-dir>/.github/`.** GitHub doesn't run nested workflows. If any exist there, delete them.
4. **Never push to `main` directly.** Lower environments get validated first, then `stage → main` via PR.
5. **Don't bypass the path filter** (e.g. removing `paths: '<wp-app-dir>/**'`). Doing so means every README edit redeploys.
6. **Never run `composer install` (or any other build step) in the deploy workflow** without first changing the vendor policy as described above.
7. **Stop if a required GitHub Actions secret is missing** — don't guess or invent values; each skill lists the exact secret names.
