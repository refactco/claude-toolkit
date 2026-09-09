# Use Refact Toolkit in Codex

The toolkit has ten optional packs. Install `base` to get the common workflows
and the `refact-toolkit` entry skill. Add other packs when a project needs them.

## Install from GitHub

Run these commands in a terminal with the Codex CLI installed:

```bash
codex plugin marketplace add refactco/claude-toolkit
codex plugin add base@refact-os
```

For a release on a particular branch, use
`codex plugin marketplace add refactco/claude-toolkit --ref <branch>`.
If the repository is private, Git must have permission to read it.

Then start a **new Codex task**. In the desktop app, open Plugins and find
**Refact Toolkit** to browse its packs. In the CLI, `/plugins` opens the browser.

Examples for optional packs:

```bash
codex plugin add wordpress@refact-os
codex plugin add client@refact-os
codex plugin add testing@refact-os
codex plugin add plain-english@refact-os
```

## Use it

Ask for an outcome, for example:

- “Use the Refact toolkit to record this project's structure and stack.”
- “Use the Refact proposal skill to draft a discovery proposal from these notes.”
- “Use the Refact WordPress workflow to check this local environment.”

You can also select the `refact-toolkit` skill from the skill picker, or use
`$refact-toolkit` in the CLI. The entry skill checks which other skills are
available before routing the request. A disabled pack must not be loaded by
reading its cache directly.

## Disable a pack for one project

Installation enables the pack in the user's Codex configuration. To override
that setting for one project, merge this into that project's `.codex/config.toml`:

```toml
[plugins."base@refact-os"]
enabled = false

[plugins."wordpress@refact-os"]
enabled = false
```

The exact key includes both the pack and marketplace: `base@refact-os`, not
just `base`. Set `enabled = true` to enable an already installed pack in the
project. Each pack is independent: turning off `base` does not turn off `client`.
Use [the full example](../examples/codex/disable-refact.toml) to disable every pack.

The [Plain English pack](../plugins/plain-english/README.md) works on its own.
It does not require Base or a project configuration file.

Codex reads project config only for **trusted projects**. Start a new task after
changing the file. Do not rely on a note in `AGENTS.md` as a replacement for the
plugin setting.

- For a team rule, commit the non-secret `.codex/config.toml`.
- For your own rule, keep it untracked with `.git/info/exclude`. Do not silently
  remove a config file that is already tracked by the team.
- The Plugins UI switch changes user defaults. Use project config for a rule
  that applies only to one project.

To use a pack only in selected projects, keep it installed, set its user-level
`enabled = false` in `~/.codex/config.toml`, and set `enabled = true` in each
selected project's `.codex/config.toml`. Preserve all other config tables.

The project override was tested with Codex CLI `0.153.4`: the base skill paths
were present in the rendered task input when enabled and absent when disabled.
The user-level installation remained enabled during this test.

## Update

For a Git marketplace, refresh it and reinstall the installed packs you want:

```bash
codex plugin marketplace upgrade refact-os
codex plugin add base@refact-os
codex plugin list --marketplace refact-os --json
```

Start a new task after the update. Repeat the `plugin add` command for other
selected packs. A general update should skip disabled packs because reinstalling
can enable them. The `manage-plugins` skill includes this rule.

`marketplace upgrade` refreshes the configured Git snapshot. A local marketplace
uses the files in its checkout; update that checkout before reinstalling.
This release does not install an automatic background updater for personal Codex.

## Develop from a local checkout

```bash
node scripts/sync-codex.mjs
codex plugin marketplace add /absolute/path/to/claude-toolkit
codex plugin add base@refact-os
```

Use one configured source for `refact-os` at a time. Keep a development checkout
separate from the Git source used by regular users. After changes, bump the
changed pack's version, run the sync script, reinstall, and start a new task.
For rapid local-only iteration, Codex's plugin-creator cachebuster helper is
also available. Do not commit those temporary version suffixes as a team release.

## Support boundaries

Both clients use the same skill folders, scripts, templates, and references.
Codex reads its native manifests; Claude Code reads its own manifests.

- Claude lifecycle hooks use explicit `hooks/claude-hooks.json` declarations.
  Codex does not start the Claude transcript uploader or install language servers.
- In Codex, memory skills explicitly prepare the memory mount before their work.
- Named Claude agent files are reusable briefs. Codex follows them through its
  available delegation tools or carries out the same bounded work directly.
- Refact Control has a separate local Codex setup procedure. Service logins,
  credentials, Node/Python, Docker, WordPress, and browser tools remain explicit
  requirements of the skills that use them.
- These packages target local Codex. Installing them is not a claim that a local
  WordPress stack or a local credential tool runs in ChatGPT on the web.

Official references: [plugin packaging](https://developers.openai.com/plugins/build/plugins),
[config precedence](https://learn.chatgpt.com/docs/config-file/config-basic),
[using plugins](https://learn.chatgpt.com/docs/plugins).
