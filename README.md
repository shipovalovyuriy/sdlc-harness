# Codex Setup

Reusable Codex setup bundle: workspace instructions, agent definitions, skills, and safe configuration snippets for agentic software delivery.

This repository is intended to be read by both humans and Codex. Keep the files clear, explicit, and easy to audit.

It packages the workflow we use for two modes:

- **AIRD Discovery Loop**: interactive product, UX, risk, UI, and technical discovery that produces an implementation-ready AIRD package.
- **AIRD Delivery Loop**: execution and verification loop that turns an AIRD package into working code with quality gates.
- **Code Review Standards**: standards-backed engineering guidance for reviewers and implementation workers.
- **Improve My Code**: iterative review, refactor, verification, and optional commit loop for an existing codebase.

The setup is intentionally portable. It does not include private Codex auth files, API keys, provider credentials, local logs, or project-specific secrets.

## Repository Layout

```text
.
├── AGENTS.md
├── CLAUDE.md
├── agents/
│   ├── architect.toml
│   ├── backend-worker.toml
│   ├── frontend-worker.toml
│   ├── reviewer.toml
│   ├── qa.toml
│   └── ...
├── config/
│   └── config.toml.example
├── docs/
│   ├── CONFIG.md
│   ├── INCLUDED.md
│   └── SECURITY.md
├── scripts/
│   └── install.sh
└── skills/
    ├── public/
    │   ├── aird-discovery-loop/
    │   ├── aird-delivery-loop/
    │   ├── code-review-standards/
    │   └── improve-my-code/
    └── ...
```

## Install

From the repository root:

```bash
./scripts/install.sh
```

By default the script installs into `~/.codex`. You can override the target:

```bash
CODEX_HOME=/path/to/codex-home ./scripts/install.sh
```

Manual install is also simple:

```bash
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills" "$CODEX_HOME/agents"
cp -R skills/. "$CODEX_HOME/skills/"
cp agents/*.toml "$CODEX_HOME/agents/"
```

## Codex Config

Merge the safe snippet from [config/config.toml.example](config/config.toml.example) into your own `~/.codex/config.toml`.

Do not commit your real `~/.codex/config.toml` if it contains local server URLs, tokens, provider settings, project paths, or other private data.

Recommended minimum:

```toml
[features]
multi_agent = true
skill_mcp_dependency_install = true

[agents]
max_threads = 6
max_depth = 1
```

See [docs/CONFIG.md](docs/CONFIG.md) for details.

## Usage

Discovery for a new feature:

```text
$aird-discovery-loop
```

Delivery from an AIRD package:

```text
$aird-delivery-loop
```

Code review or worker implementation guidance:

```text
$code-review-standards
```

Iterative codebase cleanup and refactor:

```text
$improve-my-code
```

## Agent Definitions

Agent configs live in `agents/*.toml`.

Core roles include:

- `architect`
- `architect-deep`
- `backend-worker`
- `frontend-worker`
- `worker`
- `reviewer`
- `qa`
- `explorer`
- `debugger`
- `supervisor`
- `triage`
- `docs`
- `cybersec`
- `uiux-designer`
- `product-analyst`
- `risk-analyst`

Each agent file should define the model, reasoning effort, sandbox behavior, and role-specific developer instructions. Keep responsibilities narrow so routing remains predictable.

## How The Loops Fit Together

`$aird-discovery-loop` is the planning loop. It runs an interactive discussion with the user, launches independent specialist agents where useful, identifies risks early, clarifies UI/UX when needed, and writes an AIRD package with:

- PRD, TRD, UI spec, and optional UI prototype brief
- risk register with mitigation decisions
- API contracts and data model decisions
- implementation plan and workorders
- quality gates and Definition of Done

`$aird-delivery-loop` is the implementation loop. It reads the AIRD package, spawns independent workers for discrete workorders, integrates their output, runs review and QA gates, and loops fixes back to workers until the feature satisfies the quality gates.

`$improve-my-code` is for improving an existing codebase without a new feature spec. It scans, builds a prioritized backlog, applies focused refactors, verifies behavior, runs review, and optionally commits when the user asks for commit mode.

## Validation

If you have Codex's system `skill-creator` skill installed, validate a skill with:

```bash
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" "$HOME/.codex/skills/public/aird-discovery-loop"
```

Repeat for each skill after editing.
