#!/usr/bin/env bash
# Stable entrypoint. Requires Node.js 22+ and the 1Password CLI.
set -euo pipefail
SYNC_ENV_ENTRY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SYNC_ENV_ENTRY_DIR/sync-env.mjs" "$@"
