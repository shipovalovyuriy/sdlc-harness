#!/usr/bin/env bash
# Install the SDLC harness into Codex (~/.codex by default).
# Codex is the source-of-truth layout: skills keep their public/ nesting,
# agents are TOML definitions.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

mkdir -p "$CODEX_HOME/skills" "$CODEX_HOME/agents"

# A skill directory that is a symlink belongs to another installer (for
# example HyperFrames links its skills between runtimes): never write through it.
copy_skill() {
  if [[ -L "$2" ]]; then
    echo "SKIP $(basename "$2"): $2 is a symlink managed elsewhere" >&2
    return
  fi
  mkdir -p "$2"
  cp -R "$1/." "$2/"
}

for src in "$ROOT_DIR"/skills/*/; do
  name="$(basename "$src")"
  if [[ "$name" == "public" ]]; then
    for pub in "$ROOT_DIR"/skills/public/*/; do
      copy_skill "${pub%/}" "$CODEX_HOME/skills/public/$(basename "$pub")"
    done
  else
    copy_skill "${src%/}" "$CODEX_HOME/skills/$name"
  fi
done
cp "$ROOT_DIR"/agents/*.toml "$CODEX_HOME/agents/"

VALIDATOR="$CODEX_HOME/skills/.system/skill-creator/scripts/quick_validate.py"
if [[ -f "$VALIDATOR" ]]; then
  for skill in \
    aird-discovery-loop \
    aird-delivery-loop \
    code-review-standards \
    improve-my-code
  do
    python3 "$VALIDATOR" "$CODEX_HOME/skills/public/$skill" || true
  done
fi

cat <<MSG
Installed SDLC harness for Codex into:
  $CODEX_HOME

Next steps:
  1. Merge config/config.toml.example into ~/.codex/config.toml.
  2. Restart Codex if your session does not pick up new skills.
  3. Try: \$aird-discovery-loop
MSG
