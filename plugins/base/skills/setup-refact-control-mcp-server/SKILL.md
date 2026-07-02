---
name: setup-refact-control-mcp-server
description: Wire the Refact Control MCP server (@refactco/refact-control-mcp-server, private on GitHub Packages) into a project's Claude Code — pull both secrets from 1Password and write a self-contained .mcp.json entry. No gh CLI, no .npmrc.
pattern: procedure
when_to_use: Setting up the Refact Control MCP server in a project so the agent gets read-only client/project context — "/setup-refact-control-mcp-server", "install the refact-control mcp server", "add refact context to this repo", "set up the refact-control MCP". Run in the target project, not in the refact-control repo itself.
when_not_to_use: You're in the refact-control source repo and just want to run it locally from source (use `npm run dev` in apps/mcp-server); you're publishing a new version of the package (use publish-mcp-server); the project already has a working `refact-control` MCP entry.
next_skills: []
sub_agents: []
---

# Setup Refact Control MCP Server

Add the **Refact Control MCP server** to *this* project's Claude Code so the agent can read
client/project context (clients, projects, decisions, concerns, milestones, stack, etc.).

The server ships as a private npm package on **GitHub Packages**
(`@refactco/refact-control-mcp-server`). Everything needed is **two secrets in 1Password**,
written straight into `.mcp.json`. No GitHub CLI, no GitHub login, no `~/.npmrc` — npm reads
the registry + token from environment variables in the `.mcp.json` `env` block.

> This skill is self-contained: it does not depend on the refact-control repo. You can hand
> this `SKILL.md` to a teammate's agent and it will work from any project.

Anything interactive (copying from 1Password) is the **user's** to do — pause and ask.
Never print or log the secret values back.

## 1. Get the two secrets from 1Password

Ask the user to open **1Password → vault `Env Variables & Secrets` → item
`RefactControlMcpServer`** and copy two fields:

| Field | What it's for |
|---|---|
| `GITHUB_PACKAGES_TOKEN` | classic PAT with `read:packages` — lets npm download the private package |
| `AGENT_CONTEXT_API_KEY`  | authenticates the server to the Control API |

Have them paste both into the chat, or pull them with the 1Password CLI. **Don't** use a
plain `op://Env Variables & Secrets/...` reference — the `&` in the vault name is rejected as
an invalid secret reference. Use one of these instead:

```bash
# Works for both personal logins and service accounts (vault passed as a flag, not a reference):
op item get RefactControlMcpServer --vault "Env Variables & Secrets" \
  --fields label=GITHUB_PACKAGES_TOKEN,label=AGENT_CONTEXT_API_KEY --reveal

# Or, if you prefer `op read`, reference the vault by ID (no '&' to choke on):
#   op vault list   # to find the vault ID
op read "op://<VAULT_ID>/RefactControlMcpServer/GITHUB_PACKAGES_TOKEN"
```

## 2. Write `.mcp.json`

Create (or merge into) `.mcp.json` at the **project root**. The two `npm_config_*` env vars
tell `npx` where to fetch the `@refactco` scope and how to authenticate — no `.npmrc`
needed:

```json
{
  "mcpServers": {
    "refact-control": {
      "command": "npx",
      "args": ["-y", "@refactco/refact-control-mcp-server"],
      "env": {
        "npm_config_@refactco:registry": "https://npm.pkg.github.com",
        "npm_config_//npm.pkg.github.com/:_authToken": "<GITHUB_PACKAGES_TOKEN>",
        "CONTROL_API_URL": "https://refact-control.netlify.app",
        "AGENT_CONTEXT_API_KEY": "<AGENT_CONTEXT_API_KEY>"
      }
    }
  }
}
```

Keep the env keys **exactly** as written (the `@`, `:`, and `//` are part of the npm config
names). Then:

- **Gitignore the secrets.** `.mcp.json` now holds both tokens — ensure `.mcp.json` is in
  `.gitignore` (add it if not).
- **Auto-approve the server** so the agent doesn't need interactive consent: add
  `"enabledMcpjsonServers": ["refact-control"]` to `.claude/settings.json` (or
  `settings.local.json`).

## 3. Verify

Restart Claude Code in the project. The `refact-control` tools should load automatically.
Confirm by calling one (e.g. list clients or projects).

Optional pre-check that the token can reach the package (run from a terminal; prints only a
version number, no secret):

```bash
env 'npm_config_@refactco:registry=https://npm.pkg.github.com' \
    "npm_config_//npm.pkg.github.com/:_authToken=PASTE_TOKEN" \
    npm view @refactco/refact-control-mcp-server version
```

Troubleshooting:

- 401/403 fetching the package → `GITHUB_PACKAGES_TOKEN` is wrong, expired, or its
  `read:packages` scope / org-SSO authorization is missing (maintainer re-issues it).
- 401 from the API → wrong `AGENT_CONTEXT_API_KEY` (re-copy from 1Password).
