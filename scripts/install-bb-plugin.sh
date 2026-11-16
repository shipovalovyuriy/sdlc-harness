#!/usr/bin/env bash
# Install the Software Factory plugin into bb from this repository's tagged
# releases (software-factory/vX.Y.Z). bb builds it on install and keeps it
# updated within the semver range.
#
#   ./scripts/install-bb-plugin.sh          # asks bb for confirmation
#   ./scripts/install-bb-plugin.sh --yes    # no prompt
set -euo pipefail

if ! command -v bb >/dev/null 2>&1; then
  echo "bb CLI not found. Install bb first, then run this script again." >&2
  exit 1
fi

bb plugin install "git:https://github.com/shipovalovyuriy/sdlc-harness.git@^0.1.0" \
  --subdirectory plugins/software-factory \
  --tag-prefix software-factory/ \
  "$@"
