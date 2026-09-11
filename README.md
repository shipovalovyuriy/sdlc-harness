# SDLC Harness

An AI-native software development lifecycle for agentic runtimes — **Codex**
and **Claude Code** — built around two explicit loops:

- **AIRD Discovery Loop** — turns a feature, refactor, or product idea into an
  implementation-ready AIRD package: locked decisions, probed assumptions,
  PRD/TRD, UI spec with a mock-data prototype, risk register, quality gates,
  Definition of Done, and scoped workorders.
- **AIRD Delivery Loop** — executes an accepted AIRD package slice by slice
  with fail-closed verification: real-runtime backend checks, browser checks
  with screenshot evidence, code review against standards, bounded defect
  loops, and deterministic completion criteria.

Everything is packaged as skills, subagent role definitions, and install
scripts. The repository is meant to be read by both humans and the agents
themselves: files are explicit, auditable, and versioned.

## Why a harness

Code generation is no longer the bottleneck; judgment, verification, and
context economy are. The harness encodes them as contracts instead of habits:

- **Context is disposable, disk is memory.** Orchestrator sessions are
  disposable working buffers. Everything durable lives in package files
  (`STATE.md`, `REVIEW-MANIFEST.json`, evidence logs); any fresh session
  continues from disk, never from chat history.
- **Decisions are locked, not implied.** Discovery runs an interactive,
  one-decision-at-a-time interview. High-risk or irreversible choices block
  progress until the user decides; reversible ones become explicit recorded
  assumptions.
- **Assumptions are probed, not recorded.** Before any design document exists,
  existential assumptions (external contracts, quotas, runtime capabilities)
  are tested with real calls through the real code path. Claims are locked
  before probing; substituted boundaries are declared, never hidden.
- **Evidence is fail-closed.** A required gate passes only when its checks
  actually executed and produced concrete evidence. Exit code 0 alone,
  skipped checks, or "reviewed the code, looks right" never count.
- **Budgets are contract data.** Review calls, revision attempts, context
  thresholds, and workorder sizes are machine-checked limits, not
  recommendations. A deterministic validator (`aird-validate.mjs`) enforces
  package structure, write scopes, dependency graphs, readiness fields, the
  search behind every declared write scope, and gate wiring — including that
  every edge case the requirements declare is selected by some gate.
- **The loop improves itself.** Every run ends with a metrics record compared
  against previous runs; recurring failure signals must produce concrete
  skill-change proposals backed by eval cases.

## The loops

### AIRD Discovery Loop

Phases, in risk order (depth is earned by retired risk, not spent in advance):

1. **Intake** — goal, users, constraints, success criteria; choose the
   discovery profile (`lite`/`standard`/`deep`) and package class.
2. **Discuss and lock decisions** — interactive interview gate: business,
   product, architectural, and risk-driven questions, one at a time, each with
   closed options and a recommended default. Decisions land in a discussion
   log; unresolved high-risk questions block the design.
3. **Reconnaissance** — scoped explorers map the current code and runtime into
   `codemap.md` with exact paths; remote probing stays inside subagents.
4. **Existential probe gate (blocking)** — enumerate the assumptions that
   would kill the design and test each with a real probe through the real
   production path. Refuted → back to the discussion gate; unproven → the
   package is capped at a single spike workorder.
5. **Product, UX, and UI spec** — PRD, UX framing, UI spec grounded in the
   existing design system, and a runnable mock-data **UI prototype** the user
   reviews before any TRD is finalized.
6. **Risks and assumptions** — consolidated risk register: severity,
   mitigation decisions, cheapest invalidating tests, evidence gates.
7. **Technical design** — TRD (plus API contracts and data models when they
   change): boundaries, flows, failure modes, rollout/fallback, observability,
   non-functional targets, rejected alternatives.
8. **Implementation plan and workorders** — smallest value-producing wave
   first. Workorders are sized as independently executable slices (1–3 atomic
   tasks, bounded write scopes, declared consumed inputs, impact radius of
   every contract change).
9. **Validation and the single combined review** — strict deterministic
   validation, one broad semantic + package-integrity review (a hard budget of
   exactly one call), orchestrator-owned finding closure, wave acceptance with
   per-workorder hashes.
10. **Discovery summary and process metrics** — a complete audit document for
    the user, then the metrics record and improvement proposals.

### AIRD Delivery Loop

1. **Pre-flight** — validate the manifest and base freshness, select the
   earliest accepted wave, build a one-page delivery brief, spot-check impact
   radius and plumbing with bounded searches.
2. **Bounded execution slices** — the orchestrator implements sequentially and
   checkpoints after every slice; implementation workers are spawned only for
   actual parallelism or context headroom. Write sets stay disjoint.
3. **Integration and review scheduling** — at most one broad reviewer pass per
   integrated wave; finding groups get restricted closure passes, never fresh
   broad reviews.
4. **Verification (fail-closed)** —
   - project tests/lint/typecheck/build from the quality gates;
   - **backend runtime protocol**: real database dialect, migration
     fresh-install and upgrade paths, build-and-start of the shipping
     artifact, contract exercised without mocks;
   - **UI protocol**: a real browser drives every required state (happy,
     empty, loading, error, permission) with a screenshot file per state,
     plus a usability check against the accepted prototype;
   - security review and docs gates when mapped.
5. **Defect loop** — findings become bounded fix cycles (max 3 per group, max
   3 verification cycles per run) with escalation on non-convergence.
6. **Completion and process metrics** — deterministic completion criteria,
   then the metrics record and improvement proposals. Escalated and paused
   runs are recorded too; failed runs are the most valuable data.

### Continuous improvement

Both loops end with a **Process Metrics And Loop Improvement** phase
(contract: `skills/public/aird-discovery-loop/references/process-metrics.md`):

- every run appends a JSON record to a global store
  (`~/.agent/aird-metrics/history.jsonl`) shared by both runtimes; the record
  is derived from the package by `aird-metrics.mjs`, not typed by hand, so
  runs stay comparable field by field;
- the run is compared against previous runs; a failure signal that fires
  twice — or a severe one (bypassed gate, vacuous pass, escalation, package
  defect found in delivery) — **must** produce a proposal in
  `improvement-backlog.md` naming the exact skill section to change and the
  metric that will prove the change worked;
- accepted proposals are applied to both runtime copies and covered by eval
  cases (`evals/E-NNNN.md`) — the regression suite for the loop itself.

## Subagent roles

Sixteen roles, shipped in both formats (`agents/*.toml` for Codex,
`claude/agents/*.md` for Claude Code): routing (`triage`, `supervisor`),
discovery (`explorer`, `product-analyst`, `risk-analyst`, `uiux-designer`,
`architect`, `architect-deep`), delivery (`backend-worker`, `frontend-worker`,
`worker`, `debugger`), and verification (`reviewer`, `qa`, `cybersec`,
`docs`). Purposes, spawn discipline, and output contracts: **[docs/ROLES.md](docs/ROLES.md)**.

## Skills

Harness skills (`skills/public/`):

| Skill | Purpose |
|---|---|
| `aird-discovery-loop` | The discovery loop described above |
| `aird-delivery-loop` | The delivery loop described above |
| `code-review-standards` | Standards-backed review/implementation guidance, incl. the Build-Less Ladder |
| `improve-my-code` | Scan → scoped refactor → verify → review loop for existing codebases |
| `frontend-design` | Feature-first, hierarchy-first frontend design workflow |
| `senior-backend` / `senior-frontend` | Production-grade engineering guidance per stack |
| `rat` / `rca` | Riskiest-assumption testing and root cause analysis |
| `constraint-flow-thinking` | Theory of Constraints / systems-thinking analysis |
| `usability-tester` | Persona-driven usability testing via computer use |
| `verify-on-browser` | Browser verification over Chrome DevTools Protocol |
| `cybersec-assistance` | Repo-grounded threat modeling and security review |
| `prompt-generator` | Prompt engineering for any target |

Vendored third-party skills at `skills/` top level:
`figma-implement-design`, `pdf`, `playwright`, `security-best-practices`,
`spreadsheet`. The former vendored `figma` skill was dropped: the name is
taken by the HyperFrames `figma` skill, and an install would overwrite it.

## Repository layout

```text
.
├── AGENTS.md                    # global Codex guidance
├── CLAUDE.md                    # global Claude Code guidance
├── agents/                      # subagent roles, Codex format (TOML)
├── claude/
│   ├── agents/                  # subagent roles, Claude Code format (MD)
│   └── settings.json.example    # Claude Code settings starter
├── config/
│   └── config.toml.example      # Codex config starter
├── docs/
│   ├── ROLES.md                 # subagent role reference
│   ├── INCLUDED.md              # what is included and the typical flow
│   ├── CONFIG.md
│   └── SECURITY.md
├── scripts/
│   ├── install.sh               # install both runtimes (or --codex / --claude)
│   ├── install-codex.sh
│   └── install-claude.sh
└── skills/
    ├── public/                  # harness skills (source of truth, Codex dialect)
    └── <vendored skills>
```

## Install

```bash
git clone git@github.com:shipovalovyuriy/sdlc-harness.git
cd sdlc-harness
./scripts/install.sh            # both runtimes
./scripts/install.sh --codex    # Codex only  -> ~/.codex
./scripts/install.sh --claude   # Claude Code only -> ~/.claude
```

The Codex install copies skills and TOML agents as-is. The Claude install
flattens `skills/public/<name>` to `~/.claude/skills/<name>` (Claude Code only
discovers top-level skills) and rewrites the runtime dialect: `$skill` →
`/skill`, `AGENTS.md` → `CLAUDE.md`, `${CODEX_HOME}` paths →
`${CLAUDE_CONFIG_DIR}` paths, `agent_type` → `subagent_type`, fork-field
semantics. Skill texts are maintained once, in the Codex dialect.

Then start a session and run:

```text
$aird-discovery-loop   # Codex
/aird-discovery-loop   # Claude Code
```

and, once a wave is accepted:

```text
$aird-delivery-loop    # Codex
/aird-delivery-loop    # Claude Code
```

## Security

The bundle is portable by design: no auth files, API keys, provider
credentials, logs, or project secrets. See [docs/SECURITY.md](docs/SECURITY.md).
