#!/usr/bin/env bash
# Install the SDLC harness into Codex, Claude Code, or both.
#
#   ./scripts/install.sh            # both runtimes
#   ./scripts/install.sh --codex    # Codex only  (~/.codex)
#   ./scripts/install.sh --claude   # Claude Code only (~/.claude)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
    echo "Usage: $0 [--codex|--claude|--all]" >&2
    exit 1
    ;;
esac
