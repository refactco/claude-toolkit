# File pulls from staging

## Check the required files

Use the selected site's database to identify required plugins. A local directory
listing and `wp plugin list` alone cannot reveal an active plugin whose files are
missing. Read the raw `active_plugins` option with `wp option get active_plugins
--format=json`. For multisite, read every included site's option using its `--url`
and union the paths. Also read the applicable network's `active_sitewide_plugins`
with `wp site option get active_sitewide_plugins --format=json`; union network
keys when more than one network is included. Use the correct local wp-env or
staging connection. These are reads, not activation or installation commands.

Capture required mu-plugin files from the known staging/project inventory,
including loader dependencies. `wp plugin list --status=must-use --fields=file
--format=json` identifies entry files, but does not prove their included files
are present. Inspect their required directories too. Omit only documented
host-only or local-excluded paths, with the reason in the task's evidence.
Normal WP-CLI bootstrap can load mu-plugins even with `--skip-plugins`; use an
established read-only database/file route if loading them has side effects.

Write the captured paths to a temporary local JSON inventory, then run the helper:

```json
{
  "active_plugins": ["tracked/main.php", "profiles/profiles.php"],
  "active_sitewide_plugins": {"network-tool/main.php": 1},
  "mu_plugins": ["profiles-loader.php", "profiles/lib/bootstrap.php"]
}
```

```bash
node "<skill-dir>/scripts/check-plugins.mjs" \
  apps/wordpress/wp-content "<inventory.json>"
```

Use `{}` for network plugins only after confirming a single-site installation or
an empty network option. A failed query or missing inventory is **unknown**, not
an empty list and not a successful skip check. The helper returns 0 when the
required files exist, 1 when files are missing, and 2 for invalid input. It does
not prove matching versions, complete arbitrary dependencies, or working PHP.

If importing staging's DB, inspect its requirements before the pull and repeat
the check against the imported local DB. Verify the requested local page or
profile flow afterward. Keep outgoing mail disabled. Report missing/excluded
dependencies and deferred work instead of claiming that setup is complete.

## Preview and preserve local work

The packaged `pull-files.mjs` accepts one source, one local destination, and a
kind (`plugins` or `mu-plugins`). It supports staging SSH paths and local export
directories. Resolve the staging target from the project config before calling
it; the helper validates path shape but cannot prove which environment a host is.

- Default: preview only, no deletion, and existing files preserved.
- `--apply`: copy missing files using the selected options, after a fresh preview.
- `--overwrite`: allow existing files to change. Requires a new `--backup-dir`.
- `--delete`: remove local files missing from the source. Requires a new
  `--backup-dir`. Excluded local helpers remain protected.
- `--exclude PATTERN`: repeat for documented project exclusions, in both runs.
- `--port N` and `--hosting wpengine|kinsta`: use the selected staging settings.

Run the preview and inspect the itemized additions, overwrites, and removals.
Check `git status` and local untracked work in the destination. Use `--apply` only
for the reviewed operation within the user's authorization. These flags select
behavior; they do not create authorization. Preserve files outside that scope.

Use a new gitignored backup directory outside both source and destination for
each overwrite/delete operation. The helper copies the complete local destination
there before applying; allow enough disk space. A failed snapshot stops the transfer.
It does not depend on rsync's backup mode, which differs on macOS. It refuses reuse so old backups cannot
be silently overwritten. It refuses destination symlinks; resolve their ownership
and select the real paths before proceeding. Remote paths containing shell syntax
or spaces are not supported by this helper; do not weaken quoting checks to force
one through. Use an established safe transfer route for such a project.

A preview is not a lock on the remote or local tree. Avoid competing writers.
A failed transfer can be partial: inspect local files and backups before retrying.
After a successful transfer, review the local diff, rerun the required-file check,
and exercise the requested local WordPress flow. File copy success alone is not
evidence that the application works.

## Decide exclusions from project evidence

Always protect `index.php`, local `disable-emails/` in plugins, and
`0[0-9]-wp-env-*.php` in mu-plugins. Rsync exclusion patterns support brackets;
the same exclusions protect against deletion unless `--delete-excluded` is used.
The helper never uses that flag.

Known hosting exclusions for mu-plugins:

| Hosting | Patterns |
|---|---|
| Kinsta | `kinsta-mu-plugins/`, `kinsta-mu-plugins.php` |
| WP Engine | `mu-plugin.php`, `force-strong-passwords/`, `slt-force-strong-passwords.php`, `wpe-cache-plugin*`, `wpe-update-source-selector*`, `wpe-wp-sign-on-plugin*`, `wpengine-common/`, `wpengine-security-auditor.php` |

For project-specific removals, inspect the commit and current staging dependency
before deciding. “Removed from Git” may mean “now supplied at runtime.” If the
project deliberately keeps a path absent locally, record that rule in its
existing instructions and pass a matching exclusion. Do not restore an excluded
file, invent a replacement, or automatically exclude every deleted file.

References: [rsync manual](https://download.samba.org/pub/rsync/rsync.1),
[WP-CLI plugin inventory](https://developer.wordpress.org/cli/commands/plugin/list/),
[WP-CLI site selection](https://developer.wordpress.org/cli/commands/site/list/).
