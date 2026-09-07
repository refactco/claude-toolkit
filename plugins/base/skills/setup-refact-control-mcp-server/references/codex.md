# Refact Control setup for Codex

The same private npm package can run as a local MCP server in Codex. This is a
local Codex setup; it does not register a ChatGPT web connector.

1. Check for an existing `mcp_servers.refact-control` entry in the effective
   Codex configuration. If it already works, keep it.
2. Use the parent skill's 1Password lookup to obtain the two secrets. Do not
   print values or ask the user to paste them into chat.
3. Merge the following into the target project's `.codex/config.toml`. Replace
   placeholders locally with the retrieved values, using a TOML writer or proper
   string escaping. Preserve all unrelated configuration.

```toml
[mcp_servers.refact-control]
command = "npx"
args = ["-y", "@refactco/refact-control-mcp-server"]

[mcp_servers.refact-control.env]
"npm_config_@refactco:registry" = "https://npm.pkg.github.com"
"npm_config_//npm.pkg.github.com/:_authToken" = "<GITHUB_PACKAGES_TOKEN>"
CONTROL_API_URL = "https://refact-control.netlify.app"
AGENT_CONTEXT_API_KEY = "<AGENT_CONTEXT_API_KEY>"
```

This file contains secrets after setup. Before writing, check whether the file
is tracked. If it is tracked, keep placeholders in the shared file and use an
untracked local credential-loading wrapper instead, or ask for the user's chosen
credential store. Do not place secret values into a tracked config.
For a new personal config, add `.codex/config.toml` to `.git/info/exclude` and use
restrictive file permissions. Project-local config is read only for trusted
projects. Do not alter project trust or widen tool approvals as part of setup.

Start a new Codex task and verify a read-only Refact Control tool. Do not print
the MCP configuration or secret environment in the verification result.
