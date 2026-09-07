# Claude Code repository instructions

Read and follow [AGENTS.md](AGENTS.md). It is the shared repository guide for
Claude Code and Codex, including writing style, source files, releases, and checks.

Claude-specific package hooks are declared in each `.claude-plugin/plugin.json`.
Keep `/base:refact` as the Claude command wrapper for the shared `refact-toolkit`
skill. Do not add default `hooks/hooks.json` files to these shared pack folders.
