#!/usr/bin/env bash
set -euo pipefail

# Fail if a tracked .env reappears in the repo. .env.local / .env.*.local are
# fine because .gitignore still excludes them and we treat them as the canonical
# secret store.

if [[ -f .env ]]; then
  echo "ERROR: .env is present in the working tree." >&2
  echo "       Move secrets to .env.local (gitignored) and delete .env." >&2
  exit 1
fi

exit 0
