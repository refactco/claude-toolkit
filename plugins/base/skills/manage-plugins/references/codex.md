# Manage Refact packs in Codex

Use this procedure when the active host is Codex. Do not run the Claude planner
or change `.claude/settings.json` for a Codex request.

## Inspect

```bash
codex plugin marketplace list
codex plugin list --marketplace refact-os --available --json
```

If the marketplace is absent, add `refactco/claude-toolkit` at the release ref
the user is following. Preserve an existing marketplace's source and ref.

```bash
codex plugin marketplace add refactco/claude-toolkit
```

The JSON list has `installed` and `available` arrays. Entries include `pluginId`,
`name`, `version`, `installed`, and `enabled`. Use exact IDs from this result.

## Install or update

Install only the requested packs. For a project without a named pack, choose
`base` and the stack pack (`wordpress` or `nextjs`) when the request calls for it.
Other packs are optional. The marketplace also includes `memory`.

```bash
codex plugin add base@refact-os
```

For updates, first record the installed packs and their enabled state. Refresh
a Git-backed marketplace, then reinstall only the selected installed packs:

```bash
codex plugin marketplace upgrade refact-os
codex plugin add base@refact-os
```

Reinstalling can enable a pack. Skip disabled packs during a general update;
only update and restore a disabled pack when the user asks for that pack.
Do not install missing optional packs during an update. For a local marketplace,
the source checkout must already contain the changed files; `marketplace upgrade`
does not pull a local working copy. After editing a local plugin, change its
version before reinstalling.

List the installed versions again. Ask the user to start a new task so new
skills and files load. Do not claim the current task reloaded them. A Git refresh
alone does not prove the installed copy changed.

## Enable or disable for one project

Plugin IDs include the marketplace name. In the target project's
`.codex/config.toml`, merge a table such as:

```toml
[plugins."base@refact-os"]
enabled = false
```

Use one table per pack. Preserve the rest of the file. Use `true` to enable an
already installed pack for the project. Project config loads only in a trusted
project and overrides user defaults. A new task picks up the change.

For a personal rule in that project, exclude `.codex/config.toml` through
`.git/info/exclude`. For a team rule, commit the non-secret config file. Do not
remove or ignore a file already shared with the team without the user's request.

Do not bypass disabled skills by reading the plugin cache. If the user wants
all Refact packs disabled, read the current catalog and write an `enabled = false`
table for each pack ID, not a wildcard key.
