#!/usr/bin/env bash
# Install the SDLC harness into Claude Code (~/.claude by default).
#
# Two things differ from the Codex install:
#   1. Layout: Claude Code discovers skills ONLY at the top level of
#      ~/.claude/skills — skills/public/<name> is flattened to skills/<name>.
#   2. Runtime dialect: the skill texts are written for Codex; this script
#      rewrites runtime-specific wording ($skill -> /skill, AGENTS.md ->
#      CLAUDE.md, CODEX_HOME paths, agent_type -> subagent_type, fork fields).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_HOME="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

mkdir -p "$CLAUDE_HOME/skills" "$CLAUDE_HOME/agents"

# --- copy skills: vendored top-level as-is, public/ flattened ----------------
# Claude Code does not use the Codex per-skill agents/ subdirectories.
ALL_NAMES=()
PUBLIC_NAMES=()

# A skill directory that is a symlink belongs to another installer (for
# example HyperFrames links its skills between runtimes): never replace it.
skip_symlink() {
  if [[ -L "$CLAUDE_HOME/skills/$1" ]]; then
    echo "SKIP $1: $CLAUDE_HOME/skills/$1 is a symlink managed elsewhere" >&2
    return 0
  fi
  return 1
}

for src in "$ROOT_DIR"/skills/*/; do
  name="$(basename "$src")"
  [[ "$name" == "public" ]] && continue
  skip_symlink "$name" && continue
  ALL_NAMES+=("$name")
  rm -rf "${CLAUDE_HOME:?}/skills/$name"
  cp -R "$src" "$CLAUDE_HOME/skills/$name"
done

for src in "$ROOT_DIR"/skills/public/*/; do
  name="$(basename "$src")"
  PUBLIC_NAMES+=("$name")
  skip_symlink "$name" && continue
  ALL_NAMES+=("$name")
  rm -rf "${CLAUDE_HOME:?}/skills/$name"
  cp -R "$src" "$CLAUDE_HOME/skills/$name"
  rm -rf "${CLAUDE_HOME:?}/skills/$name/agents"
done

rewrite() {
  local file="$1"
  # Order matters: concrete paths first, then broad word-level rewrites.
  # Protected phrases: "Claude and Codex" legitimately names both runtimes,
  # "Codex Security" is a product name, "Codex app" names a Codex-only surface.
  # KEEP_CODEX_WORD=1 keeps the bare word where Codex is the subject matter
  # (a target runtime the skill writes for), not the host runtime.
  perl -pi -e '
    s{Claude and Codex}{__BOTH_RUNTIMES__}g;
    s{Codex Security}{__CODEX_SECURITY__}g;
    s{Codex app}{__CODEX_APP__}g;
    s{\$\{CODEX_HOME:-\$HOME/\.codex\}/skills/public/}{\${CLAUDE_CONFIG_DIR:-\$HOME/.claude}/skills/}g;
    s{\$\{CODEX_HOME:-\$HOME/\.codex\}}{\${CLAUDE_CONFIG_DIR:-\$HOME/.claude}}g;
    s{export CODEX_HOME=}{export CLAUDE_CONFIG_DIR=}g;
    s{\$CODEX_HOME/skills/}{\${CLAUDE_CONFIG_DIR:-\$HOME/.claude}/skills/}g;
    s{\$CODEX_HOME\b}{\$CLAUDE_CONFIG_DIR}g;
    s{~/\.codex/skills/public/}{~/.claude/skills/}g;
    s{~/\.codex/skills}{~/.claude/skills}g;
    s{\.codex/skills/public}{.claude/skills}g;
    s{codex exec}{claude -p}g;
    s{\bAGENTS\.md\b}{CLAUDE.md}g;
    s{Spawn it with `fork_turns: "none"` \(`fork_turns`, not `fork_context`, is the supported spawn field\)\.}{Claude Code subagents always start with a clean context; there is no fork field to set.}g;
    s{Use `fork_turns: "none"` for workers\. Pass}{Pass}g;
    s{`fork_turns`, not `fork_context`, is the supported spawn field\.}{Claude Code subagents always start with a clean context; there is no fork field to set.}g;
    s{, and spawn with `fork_turns: "none"`\.}{. Claude Code subagents always start with a clean context; there is no fork field to set.}g;
    s{Spawn it with `fork_turns: "none"`\.}{Claude Code subagents always start with a clean context; there is no fork field to set.}g;
    s{(?<![a-zA-Z_])agent_type}{subagent_type}g;
    s{--runtime codex\b(?!\|)}{--runtime claude}g;
    s{\bCodex\b}{Claude Code}g unless $ENV{KEEP_CODEX_WORD};
    s{__BOTH_RUNTIMES__}{Claude and Codex}g;
    s{__CODEX_SECURITY__}{Codex Security}g;
    s{__CODEX_APP__}{Codex app}g;
  ' "$file"
}

# Skills where "Codex" is a target runtime the skill writes prompts for.
CODEX_AS_SUBJECT=" prompt-generator "

for name in "${ALL_NAMES[@]}"; do
  keep_codex=""
  [[ "$CODEX_AS_SUBJECT" == *" $name "* ]] && keep_codex=1
  while IFS= read -r -d '' file; do
    # process-metrics.md is the canonical cross-runtime contract: it names
    # both runtimes and both install paths on purpose. Never rewrite it.
    [[ "$(basename "$file")" == "process-metrics.md" ]] && continue
    KEEP_CODEX_WORD="$keep_codex" rewrite "$file"
    # $<skill-name> invocation tokens -> /<skill-name>
    for token in "${PUBLIC_NAMES[@]}"; do
      perl -pi -e "s{\\\$\Q$token\E\b}{/$token}g" "$file"
    done
  done < <(find "$CLAUDE_HOME/skills/$name" -type f \( -name "*.md" -o -name "*.sh" \) -print0)
done

# --- Claude subagent role definitions ----------------------------------------
cp "$ROOT_DIR"/claude/agents/*.md "$CLAUDE_HOME/agents/"

# --- leftover-dialect check ---------------------------------------------------
# Only the files the rewrite touches; scripts may read CODEX_HOME on purpose.
LEFTOVERS="$(grep -RIl --include='*.md' --include='*.sh' 'fork_turns\|fork_context\|CODEX_HOME' \
  $(for n in "${ALL_NAMES[@]}"; do echo "$CLAUDE_HOME/skills/$n"; done) \
  2>/dev/null | grep -v 'process-metrics\.md' || true)"
if [[ -n "$LEFTOVERS" ]]; then
  echo "WARNING: Codex-specific wording may remain in:"
  echo "$LEFTOVERS"
  echo "Review these files manually."
fi

cat <<MSG
Installed SDLC harness for Claude Code into:
  $CLAUDE_HOME

Installed: $((${#PUBLIC_NAMES[@]})) harness skills (flattened), vendored skills, $(ls "$ROOT_DIR"/claude/agents/*.md | wc -l | tr -d ' ') agent roles.

Next steps:
  1. Optionally merge claude/settings.json.example into ~/.claude/settings.json.
  2. Restart Claude Code if the session does not pick up new skills.
  3. Try: /aird-discovery-loop
MSG
