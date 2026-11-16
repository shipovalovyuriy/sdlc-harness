#!/usr/bin/env bash
# Install the SDLC harness into Codex, Claude Code, or both.
#
#   ./scripts/install.sh            # both runtimes
#   ./scripts/install.sh --codex    # Codex only  (~/.codex)
#   ./scripts/install.sh --claude   # Claude Code only (~/.claude)
#   ./scripts/install.sh --all --bb-plugin   # both runtimes + the Software Factory plugin for bb
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

WITH_BB_PLUGIN=""
ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--bb-plugin" ]]; then WITH_BB_PLUGIN=1; else ARGS+=("$arg"); fi
done
set -- "${ARGS[@]+"${ARGS[@]}"}"

case "${1:---all}" in
  --codex)
    "$SCRIPT_DIR/install-codex.sh"
    ;;
  --claude)
    "$SCRIPT_DIR/install-claude.sh"
    ;;
  --all)
    "$SCRIPT_DIR/install-codex.sh"
    "$SCRIPT_DIR/install-claude.sh"
    ;;
  *)
    echo "Usage: $0 [--codex|--claude|--all] [--bb-plugin]" >&2
    exit 1
    ;;
esac

if [[ -n "$WITH_BB_PLUGIN" ]]; then
  "$SCRIPT_DIR/install-bb-plugin.sh"
fi
