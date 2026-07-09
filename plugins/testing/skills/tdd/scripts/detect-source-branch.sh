#!/usr/bin/env bash
# Print the source branch: the first of stage, staging, main that exists locally
# or on origin. Shared by the tdd orchestrator (branch cut) and red-green-refactor
# (see that skill's references/test-strategy.md) so the detection logic lives once.
set -euo pipefail
for b in stage staging main; do
  if git rev-parse --verify --quiet "$b" >/dev/null || git rev-parse --verify --quiet "origin/$b" >/dev/null; then
    echo "$b"
    exit 0
  fi
done
echo "No source branch found (tried: stage, staging, main)" >&2
exit 1
