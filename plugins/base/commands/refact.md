---
description: Refact toolkit menu — route a /base:refact action to the shared toolkit skill.
argument-hint: "[action] e.g. config | sync asana | wp-env | setup nextjs"
---

The user invoked `/base:refact $ARGUMENTS`.

Read `${CLAUDE_PLUGIN_ROOT}/skills/refact-toolkit/SKILL.md` and follow it for
`$ARGUMENTS`. The shared skill owns the menu, pack selection, and routing rules.
If the arguments are empty, show its menu and wait for the user to choose.
