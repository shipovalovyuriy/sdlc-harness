# Configuration Guide

This repository ships only safe configuration examples. Your real Codex configuration usually lives at:

```text
~/.codex/config.toml
```

Project-local config may also exist under:

```text
<project>/.codex/config.toml
```

## Minimum Settings

The AIRD workflow expects multi-agent execution:

```toml
[features]
multi_agent = true
skill_mcp_dependency_install = true
memories = false

[agents]
max_threads = 6
max_depth = 1
```

## Memory Profile

Memories are disabled in the default config to avoid injecting cross-repository
context into every turn and subagent. Enable them only when a task needs
cross-session continuity:

```toml
# ~/.codex/memory.config.toml
[features]
memories = true
```

Start that profile with:

```bash
codex --profile memory
```

## Optional Commit Support

If you want Codex to use its commit flow when you explicitly ask for a commit:

```toml
[features]
codex_git_commit = true
```

Leave it disabled when you want every git operation to remain fully manual.

## What Not To Commit

Do not commit a full personal `config.toml` unless you have reviewed it carefully. It may contain:

- private MCP server URLs
- tokens
- local filesystem paths
- model/provider preferences
- project-specific defaults
- approval policies that are unsafe for other users

Use `config/config.toml.example` as a public snippet, not as a dump of a real machine.
