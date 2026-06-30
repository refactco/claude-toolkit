#!/usr/bin/env node
// Claude Code UserPromptSubmit hook (base pack).
// When a /refact action is invoked but the slim .refact-os.json is missing,
// add a gentle note so the agent records project structure + tech stack first.
// Never blocks: always exits 0.

import fs from "node:fs";
import path from "node:path";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let payload = {};
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    payload = {};
  }

  const prompt = String(payload.prompt || "");
  // Only react to an explicit /refact action.
  if (!/(^|\s)\/refact(\s|$)/.test(prompt)) {
    process.exit(0);
  }

  const root = process.env.CLAUDE_PROJECT_DIR || process.env.CLAUDE_WORKING_DIR || process.cwd();
  const cfg = path.join(root, ".refact-os.json");

  if (!fs.existsSync(cfg)) {
    process.stdout.write(
      "Note: `.refact-os.json` was not found in this project. It should hold the canonical " +
        "project structure + tech stack (no secrets). Run `/refact config` (the " +
        "update-project-config skill) to create it so the other skills know the stack.\n"
    );
  }

  process.exit(0);
});
