# Included Skills And Agents

## Harness skills (`skills/public/`)

### `aird-discovery-loop`

Interactive AIRD discovery loop for feature planning. It produces
PRD/TRD/UI/risk/workorder artifacts, probes existential assumptions with real
calls before design, and keeps risk discussion active with the user instead of
silently drafting specs. Ends with a process-metrics record and improvement
proposals.

### `aird-delivery-loop`

Implementation and verification loop for an accepted AIRD package. It executes
bounded slices, integrates changes, and runs fail-closed quality gates:
real-runtime backend checks, browser checks with screenshot evidence, review,
QA, and bounded defect loops. Ends with a process-metrics record and
improvement proposals.

### `code-review-standards`

Standards-backed review and implementation guidance for reviewers and workers:
project structure, function/module design, reuse (the Build-Less Ladder),
performance, API contracts, testing, security, and language-specific
references.

### `improve-my-code`

Codebase improvement loop: scan, prioritized candidates, focused refactors,
verification, review/QA, optional commit.

### Supporting skills

- `frontend-design` — feature-first, hierarchy-first frontend design workflow.
- `senior-backend` / `senior-frontend` — production-grade per-stack guidance.
- `rat` / `rca` — riskiest-assumption testing and root cause analysis; loaded
  by `risk-analyst` during discovery.
- `constraint-flow-thinking` — Theory of Constraints / systems-thinking
  analysis.
- `usability-tester` — persona-driven usability testing via computer use.
- `verify-on-browser` — browser verification over Chrome DevTools Protocol;
  loaded by `qa` for UI gates.
- `cybersec-assistance` — repo-grounded threat modeling and security review.
- `prompt-generator` — prompt engineering for any target.

Vendored third-party skills live at the `skills/` top level:
`figma-implement-design`, `pdf`, `playwright`, `security-best-practices`,
`spreadsheet`. The former vendored `figma` skill was dropped: the name is
taken by the HyperFrames `figma` skill, and an install would overwrite it.

## Agents

Sixteen subagent roles in two formats — `agents/*.toml` (Codex) and
`claude/agents/*.md` (Claude Code). See [ROLES.md](ROLES.md) for the full
reference: purposes, loop stages, and spawn discipline.

## Continuous improvement

Both loops end by running
`skills/public/aird-delivery-loop/assets/scripts/aird-metrics.mjs`, which
derives the run's metrics from the package on disk, writes a record to
`~/.agent/aird-metrics/history.jsonl` (shared across runtimes), and prints the
comparison with previous runs. For recurring or severe failure signals the
loop appends skill-change proposals to
`~/.agent/aird-metrics/improvement-backlog.md`, each backed by an eval case.
The contract lives at
`skills/public/aird-discovery-loop/references/process-metrics.md`.

## Typical Flow

1. Run `$aird-discovery-loop` (Codex) or `/aird-discovery-loop` (Claude Code).
2. Discuss assumptions, risks, UI, and technical shape with the user; probe
   existential assumptions with real calls.
3. Produce the AIRD package, accept the first wave, review the discovery
   summary.
4. Run `$aird-delivery-loop` / `/aird-delivery-loop`.
5. The orchestrator implements slices; workers spawn only for parallelism or
   context headroom.
6. Reviewer, QA, browser, security, and usability gates run as required, all
   fail-closed with evidence.
7. Fixes loop until the Definition of Done is satisfied.
8. The loop records metrics, compares with history, and proposes its own
   improvements.
