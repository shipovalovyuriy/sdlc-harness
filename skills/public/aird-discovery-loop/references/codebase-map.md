# Codebase Map

## Standard: `codemap.md` (default for non-trivial changes)

For any non-trivial change, `explorer` writes a single `codemap.md` at the AIRD package root, scoped to the files relevant to the change:

- a hierarchical tree of the relevant directories/files, one line of purpose per node;
- a `## Cross-cutting` section for shared infrastructure the change touches (DB, auth, config, logging, test runner, CI).

This is the map delivery and verification agents work from. Load raw source only when a workorder needs a direct edit — the codemap keeps the working context lean instead of re-reading the tree in every agent. Skip `codemap.md` only for tiny changes confined to already-known files.

## Deeper split (broad or unfamiliar codebases)

For broad, unfamiliar, or cross-layer work, additionally produce the multi-file map below across scoped explorers.

Preferred location:

```text
.agent/aird/<feature-slug>/codebase/
```

Suggested files:

- `architecture.md`: conceptual layers, data flow, entry points, cross-cutting concerns.
- `stack.md`: language, runtime, frameworks, package manager, critical dependencies, commands.
- `structure.md`: directory purposes, where new code belongs, naming conventions.
- `testing.md`: test runner, commands, file patterns, fixtures, mocking, coverage expectations.
- `concerns.md`: fragile areas, known bugs, security concerns, performance limits, test gaps.

Explorer split:

- tech/stack explorer writes `stack.md`;
- architecture explorer writes `architecture.md` and `structure.md`;
- quality explorer writes `testing.md`;
- concerns explorer writes `concerns.md`.

The main session should collect confirmations and paths, not paste full map contents back into the chat.
