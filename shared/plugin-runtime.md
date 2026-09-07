# Shared plugin runtime

These skills work in Claude Code and Codex. Follow the active host's tools,
permissions, and user instructions.

- Resolve bundled files from the loaded `SKILL.md`, not from the project working
  directory. Its parent is the skill directory; two more parents give the plugin
  root. In command examples, replace `${CLAUDE_PLUGIN_ROOT}` with that absolute
  plugin root and quote the path. This is a path placeholder in shared instructions;
  do not assume the environment variable exists in Codex. Keep script execution in
  the target project so project config and relative output paths still work.
- To invoke another skill, use the host's skill tool when available. In Codex,
  find the named skill in the available-skills list, read its `SKILL.md`, and follow
  it. Within this pack, sibling skills are under `../<skill-name>/SKILL.md`.
  Do not invent a `Skill` tool or run Claude's CLI to load a Codex skill.
- Names such as `insights:data-puller` identify agent briefs at
  `<plugin-root>/agents/data-puller.md`. In Claude Code, use the registered agent.
  In Codex, read the brief and pass its instructions to an available subagent tool.
  Claude agent/model frontmatter does not select a Codex model. Preserve read-only
  limits, sequential work, approval gates, and output limits. If delegation is not
  available, do the same bounded work in the current task and save large output to
  files. Do not claim work ran in a separate agent when it did not.
- Use the active host's planning and question tools when a workflow asks for a
  todo list or a question. If those tools are absent, keep a short written plan or
  ask the user directly. Follow authorization already given in the conversation.
- Discover connected service tools by their purpose and schema. Tool prefixes
  can differ by host. A missing service connection is a setup requirement; never
  invent tool results or credentials.
- Claude's command menu is `/base:refact`. In Codex, use the `refact-toolkit` skill
  or ask for the desired outcome. Plugin install/update commands belong to the
  current host; see the `manage-plugins` skill for the correct branch.
- Claude lifecycle hooks and language-server setup are not enabled by these
  Codex packages. Perform required project-config checks explicitly in the skill.
  Transcript upload remains a Claude-only feature.
- For a `memory` pack workflow in Codex, first run the bundled
  `hooks/refresh-memory-mount.mjs` from the target project, with an absolute script
  path. Honor `REFACT_MEMORY_READONLY`. Then follow the memory skill's own checks.
  Do not treat a missing memory mount as a successful refresh.

Changes to these shared notes are copied into each installable pack by
`node scripts/sync-codex.mjs`. Edit the source under `shared/`.
