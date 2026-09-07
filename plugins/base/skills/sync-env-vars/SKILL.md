---
name: sync-env-vars
description: Sync environment settings between a local .env and the team's 1Password item. Preview a single-key push or an explicitly directed full sync while preserving documentation and unrelated settings.
pattern: procedure
when_to_use: Adding or changing environment keys, recovering a missing local environment, checking vault/local differences, or reviewing environment-related changes before a commit.
when_not_to_use: WordPress wp-config values; storing secret values in Git or chat; changing unrelated credential-store items; a read-only code review does not authorize an environment write.
next_skills: []
sub_agents: []
---

# Sync Env Vars

Read [runtime instructions](../../references/plugin-runtime.md) before using this skill.

Keep local `.env` values and the intended 1Password project item consistent.
`.env.example` declares keys and documents their use. It is not a value source or
permission to remove a key from the vault.

## Choose the operation from the request

| Request | First operation |
|---|---|
| Add or update one known key | `sync-env.sh push <KEY>` |
| Inspect differences | `sync-env.sh diff` |
| Recover a missing `.env` from the vault | `sync-env.sh sync --source vault` |
| Replace the vault values with the complete local set | `sync-env.sh sync --source env` |
| Compare declared keys with local keys | `sync-env.sh keys-diff` |

All commands are read-only unless **`--yes` is passed to `push` or `sync`**.
Run the preview, inspect the key changes and target, then apply the same operation
with `--yes` when it is within the user's existing authorization. Do not ask for
approval again for the exact update already requested. Ask when the target,
authoritative source, or a newly discovered destructive change needs a decision.

A one-key push changes only that key in 1Password. It leaves `.env`,
`.env.example`, and other vault fields alone. If a newly added key needs a public
example declaration, add its empty placeholder and documentation as a separate
local edit within the task; do not run a full sync just to add that declaration.

A **full sync mirrors the selected complete source**, including removal of keys
that source does not contain. Never use it as a substitute for a single-key
request. The preview lists each addition, update, and removal. Full sync updates
the example key set while retaining comments and existing non-secret defaults.

## Run the packaged script

Resolve `<script>` to the absolute path of this skill's `scripts/sync-env.sh`.
Quote it and run from the target project root. The shell entrypoint delegates to
`scripts/sync-env.mjs`, which requires **Node.js 22+** and the **1Password CLI**.
It does not require `jq`.

```bash
bash "<script>" push API_TOKEN
# Apply when this exact key update is authorized:
bash "<script>" push API_TOKEN --yes

bash "<script>" sync --source vault
# Apply the reviewed complete-source replacement:
bash "<script>" sync --source vault --yes

bash "<script>" diff
bash "<script>" keys-diff
```

`SYNC_ENV_ASSUME_YES` no longer authorizes writes. Use the explicit `--yes` flag.
A failed write or missing verification is not permission to retry a mutation:
read the current item first, since a failed response can follow a successful write.

## Locate the correct app and item

1. Use explicit `--env-file` / `--example-file` paths when the app is known.
   If only one path is supplied, the other file defaults to the same directory.
2. Otherwise, inspect existing `.env.example` files, then `.env` files, excluding
   dependencies, generated files, agent tooling, and WordPress directories.
3. In a monorepo, inspect each candidate's `1password_project` header. An exact
   `--project` title can select one candidate. If multiple remain, list them and
   resolve the intended app; do not silently write a root `.env`.
4. When no env files exist, code accessor patterns identify candidate app
   directories. If no accessor is found, the project root is the fallback.

The normal headers are:

```dotenv
# 1password_vault: Env Variables & Secrets
# 1password_project: ExampleProject/Admin - Local
```

The vault is fixed to `Env Variables & Secrets`. Select the actual environment
from the request; do not guess staging or production. An existing project header
wins over the generated name. `--project` (or `PROJECT_ITEM`) overrides the title.
New titles use PascalCase project/app names:

- Root file: `ProjectName - Local`.
- `apps/<app>/.env`: `ProjectName/AppName - Local`.
- Other nested file: `ProjectName/ParentFolderName - Local`.

For a known app or an existing item with another name:

```bash
bash "<script>" push API_TOKEN --project "ExampleProject/Admin - Local" \
  --env-file apps/admin/.env --example-file apps/admin/.env.example
```

Check real directories and project instructions. WordPress values belong to the
WordPress tooling; do not sync them into a new general `.env`.

## Decide which values are authoritative

- If only one source exists, `sync` can identify it and show a preview.
- If both sources have the same values, there is no direction conflict.
- If both differ, choose `--source env` or `--source vault` from the user's request
  and current evidence. Modification times do **not** authorize replacing either
  source: touching or copying a file can change its time without changing values.
- Empty local values cannot clear vault fields. Fill or deliberately remove those
  keys before an authorized full replacement.
- A failed vault read is not a missing item. Resolve authentication/network access
  before proceeding; do not create a duplicate or fabricate an empty source.

If neither source exists, first check the correct item title. Then identify the
required keys from the application and existing examples. Let the user enter
values locally or use the established credential store. Never invent values.
Search for actual environment accessors such as `process.env.KEY`,
`import.meta.env.KEY`, `os.getenv`, `getenv`, or framework `env()` calls, not bare
uppercase words. Keep keys that have application defaults in the review. Computed
key names need code-level inspection.

## Review and verify

The preview prints action, key, presence before/after, and target. **All values
are concealed**, including short values and keys with unexpected names. The
ADD/UPDATE/REMOVE action explains the change without printing part of a secret.
Do not add a separate command that prints the values to make the preview clearer.

Before applying, verify the app path, vault, item title, source, and the exact
keys affected. After a vault write, the script reads the item back and checks the
expected values. It also re-reads the vault item before sending an update and
refuses a detected concurrent edit. This check is not an atomic lock: avoid
competing writers, and reconcile uncertain outcomes before retrying. Local output
is parsed before writing and replaced atomically.
Inspect the example-file diff to confirm documentation and placeholders are right.

The parser accepts Node's dotenv format: comments, `export` prefixes, quoted and
multiline values. It rejects duplicate keys or syntax it cannot preserve safely.
It never sources `.env` as shell code. Values that cannot be represented without
loss cause the operation to stop before writing the local file.

## Credential handling

Use the existing authenticated `op` connection. For setup, use local sign-in or
secure local service-account entry. Do not ask the user to paste a token into
chat, automatically rewrite shell startup files, or create a public endpoint to
extract secrets. Follow the host's actual permissions when access is unavailable.

The script sends JSON through standard input, keeping values out of command
arguments and logs. Vault writes require a dedicated **Secure Note** environment
item. Other item categories remain unchanged because JSON templates cannot
preserve every credential type, such as passkeys. Do not silently convert an item.

Never commit `.env` or copy real secret values into `.env.example`. Supported
alternative tools can be used when needed, but they must honor the same source,
target, scope, and secret-handling rules. Reconcile any resulting local changes
with the intended vault item; do not bypass this contract with an ad hoc sync.
