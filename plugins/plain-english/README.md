# Plain English

Clear explanations, updates, and rewrites for readers who prefer common words.
The skill adapts to what the reader already knows. It keeps facts, uncertainty,
conditions, numbers, and exact commands accurate. It allows detailed answers when
requested and follows an explicit request for another language.

This pack works on its own in Claude Code and Codex. It does not require Base,
project configuration, extra tools, or a service connection. It has no hooks.

## Install

Add the marketplace once, then install this pack.

In Claude Code:

```text
/plugin marketplace add refactco/claude-toolkit
/plugin install plain-english@refact-os
```

If the marketplace was already added, refresh it with
`/plugin marketplace update refact-os` before installing. Run `/reload-plugins`
or start a new session after installation.

In the Codex terminal:

```bash
codex plugin marketplace add refactco/claude-toolkit
codex plugin add plain-english@refact-os
```

If the marketplace was already added, refresh it with
`codex plugin marketplace upgrade refact-os` before installing. Start a new
Codex task after installation.

## Use

Ask: "Use Plain English to explain why we should check Git before a push. I know
push and pull, but English is difficult for me."

You can select the skill explicitly:

- Claude Code: `/plain-english:plain-english` followed by your request.
- Codex: select **Plain English** from the skill picker, or use `$plain-english`.

The assistant can also choose the skill when the request or an established reader
preference calls for simple English. Installing it does not force every answer
into a fixed format or make it an English lesson.

## Turn it on or off

In Claude Code, use `/plugin enable plain-english@refact-os` or
`/plugin disable plain-english@refact-os`. To save a choice for a project, merge
`"plain-english@refact-os": false` into `enabledPlugins` in that project's
`.claude/settings.json`. Use `true` to enable it.

In Codex, use the plugin's switch in the Plugins page. For a project choice,
merge this table into that project's `.codex/config.toml`:

```toml
[plugins."plain-english@refact-os"]
enabled = false
```

Use `true` to enable an installed copy. Project settings require a trusted
project. Start a new task after a change. These switches affect this pack only.

## Source and checks

Both tools load [the same skill](skills/plain-english/SKILL.md). Each tool has its
own plugin manifest. Keep the [source acknowledgments and license notices](THIRD_PARTY_NOTICES.md)
with distributed copies.

Writing examples and review criteria live in `tests/skill-evals/plain-english/`
in the source repository. They check meaning and instruction-following; they
are not a study of reader comprehension.

Packaging references: [OpenAI](https://developers.openai.com/plugins/build/plugins)
and [Claude Code](https://code.claude.com/docs/en/plugins).
